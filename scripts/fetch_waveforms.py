#!/usr/bin/env python3
"""Fetch and verify the two recorded Tohoku waveform fixtures."""

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import platform
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import obspy
from obspy import UTCDateTime, read, read_inventory
from obspy.geodetics import locations2degrees
import scipy
from scipy.signal import resample_poly

from catalog_facts import dependency_hashes, load_facts, verify_dependencies


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "fixtures" / "observed"
FACTS = ROOT / "fixtures/investigation/catalog-facts.json"
EVENT_ID = "official20110311054624120_30"
EVENT_URL = f"https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/{EVENT_ID}.geojson"
SERVICE = "https://service.iris.edu/fdsnws"
POLICY_URL = "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits"
NETWORK_DOI = "https://doi.org/10.7914/SN/IU"
ORIGIN = UTCDateTime("2011-03-11T05:46:24.120Z")
START = ORIGIN - 60
END = ORIGIN + 2700
PROCESSING = [
    "Convert raw integer instrumental counts to float64.",
    "Remove the least-squares linear trend over the complete trace.",
    "Apply a cosine taper to 2 percent at each end, limited to 30 seconds.",
    "Apply a 4-corner, zero-phase Butterworth bandpass at 0.02 to 0.2 Hz.",
    "Resample 20 Hz to 1 Hz with scipy.signal.resample_poly, up=1, down=20, window=('kaiser', 5.0), padtype='constant'. This includes an anti-alias FIR filter.",
    "Round the displayed count samples to three decimal places. Preserve the raw MiniSEED separately.",
]


@dataclass(frozen=True)
class Station:
    code: str
    expected_distance_range: tuple[float, float]
    role: str

    @property
    def trace_id(self):
        return f"IU.{self.code}.00.BHZ"


STATIONS = (
    Station("ANMO", (80, 86), "Mantle P and S arrival comparison"),
    Station("LVC", (146, 152), "Inner-core-transiting PKIKP arrival comparison"),
)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()


def download(url, name, downloads, refresh):
    path = OUTPUT / name
    if path.exists() and not refresh:
        if name not in downloads:
            raise ValueError(f"Cached {name} has no acquisition record. Use --refresh.")
        if downloads[name]["requested_url"] != url:
            raise ValueError(f"The source URL for {name} changed. Review it before using --refresh.")
        return path.read_bytes()
    request = Request(url, headers={"User-Agent": "TauP-workbench-observed-fixtures/1.0"})
    with urlopen(request, timeout=30) as response:
        content = response.read()
        if not content:
            raise ValueError(f"No data returned by {url}")
        downloads[name] = {
            "requested_url": url,
            "response_url": response.geturl(),
            "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
            "content_type": response.headers.get("Content-Type"),
        }
    path.write_bytes(content)
    return content


def query_url(service, station, **extra):
    params = {
        "net": "IU",
        "sta": station.code,
        "loc": "00",
        "cha": "BHZ",
        "starttime": str(START),
        "endtime": str(END),
        **extra,
    }
    return f"{SERVICE}/{service}/1/query?{urlencode(params)}"


def event_metadata():
    event = load_facts(FACTS)["event"]
    if event["id"] != EVENT_ID or event["origin_time_utc"] != str(ORIGIN):
        raise ValueError("Reviewed catalog facts differ from the configured event")
    return {
        "id": event["id"], "name": event["place"], "origin_time_utc": event["origin_time_utc"],
        "latitude_deg": event["latitude_deg"], "longitude_deg": event["longitude_deg"], "depth_km": event["depth_km"],
        "magnitude": event["magnitude"], "magnitude_type": event["magnitude_type"],
        "source_url": EVENT_URL, "event_page_url": event["event_page_url"],
    }


def observed_trace(station, raw, metadata, event):
    stream = read(BytesIO(raw), format="MSEED")
    if len(stream) != 1 or stream[0].id != station.trace_id:
        raise ValueError(f"Expected one continuous {station.trace_id}. Received {stream}.")
    trace = stream[0]
    if trace.stats.sampling_rate != 20 or trace.stats.npts != 55200:
        raise ValueError(f"Unexpected source sample grid for {station.trace_id}.")
    if abs(trace.stats.starttime - START) > trace.stats.delta:
        raise ValueError(f"Source trace does not begin within one sample of the requested window.")
    if abs(trace.stats.endtime - END) > trace.stats.delta:
        raise ValueError(f"Source trace does not end within one sample of the requested window.")
    inventory = read_inventory(BytesIO(metadata), format="STATIONXML")
    epoch = inventory.select(network="IU", station=station.code, location="00", channel="BHZ", time=ORIGIN)
    if len(epoch) != 1 or len(epoch[0]) != 1 or len(epoch[0][0]) != 1:
        raise ValueError(f"Expected one active StationXML channel epoch for {station.trace_id}.")
    site = epoch[0][0]
    channel = site[0]
    if channel.restricted_status != "open" or site.restricted_status != "open":
        raise ValueError(f"Metadata does not identify {station.trace_id} as open.")
    if channel.sample_rate != trace.stats.sampling_rate or channel.dip != -90:
        raise ValueError(f"Unexpected vertical channel metadata for {station.trace_id}.")
    distance = float(locations2degrees(event["latitude_deg"], event["longitude_deg"], channel.latitude, channel.longitude))
    if not station.expected_distance_range[0] < distance < station.expected_distance_range[1]:
        raise ValueError(f"Unexpected distance for {station.trace_id}.")
    lat1, lat2 = np.deg2rad([event["latitude_deg"], channel.latitude])
    longitude_difference = np.deg2rad(channel.longitude - event["longitude_deg"])
    azimuth = float(np.rad2deg(np.arctan2(
        np.sin(longitude_difference) * np.cos(lat2),
        np.cos(lat1) * np.sin(lat2) - np.sin(lat1) * np.cos(lat2) * np.cos(longitude_difference),
    )) % 360)
    processed = trace.copy()
    processed.data = processed.data.astype(np.float64)
    processed.detrend("linear")
    processed.taper(max_percentage=0.02, type="cosine", max_length=30)
    processed.filter("bandpass", freqmin=0.02, freqmax=0.2, corners=4, zerophase=True)
    samples = resample_poly(processed.data, up=1, down=20, window=("kaiser", 5.0), padtype="constant")
    if not np.isfinite(samples).all() or np.ptp(samples) == 0:
        raise ValueError(f"Invalid processed waveform for {station.trace_id}.")
    return {
        "id": station.trace_id,
        "network": "IU",
        "station": station.code,
        "location": "00",
        "channel": "BHZ",
        "station_name": site.site.name,
        "latitude_deg": channel.latitude,
        "longitude_deg": channel.longitude,
        "elevation_m": channel.elevation,
        "sensor_depth_m": channel.depth,
        "distance_deg": distance,
        "azimuth_deg": azimuth,
        "distance_convention": "Spherical geographic great-circle distance, without geocentric latitude correction.",
        "role": station.role,
        "start_time_utc": str(trace.stats.starttime),
        "start_offset_s": trace.stats.starttime - ORIGIN,
        "sample_rate_hz": 1,
        "sample_count": len(samples),
        "units": "counts",
        "component": "Vertical, positive up as described by StationXML dip -90 degrees.",
        "instrument_response_removed": False,
        "samples": np.round(samples, 3).tolist(),
        "processing": PROCESSING,
        "raw": {
            "start_time_utc": str(trace.stats.starttime),
            "end_time_utc": str(trace.stats.endtime),
            "sample_rate_hz": trace.stats.sampling_rate,
            "sample_count": trace.stats.npts,
            "mseed_quality_indicator": trace.stats.mseed.dataquality,
        },
        "source": {
            "waveform_url": query_url("dataselect", station),
            "station_url": query_url("station", station, level="response", format="xml"),
            "network_doi": NETWORK_DOI,
            "license_url": POLICY_URL,
            "credit": "Albuquerque Seismological Laboratory/USGS (1988), Global Seismograph Network (GSN - IRIS/USGS), doi:10.7914/SN/IU. Accessed through the EarthScope-operated IRIS Data Management Center.",
        },
        "raw_mseed_path": f"fixtures/observed/{station.trace_id}.mseed",
        "stationxml_path": f"fixtures/observed/{station.trace_id}.station.xml",
    }


def make_fixture():
    event = event_metadata()
    traces = [observed_trace(
        station,
        (OUTPUT / f"{station.trace_id}.mseed").read_bytes(),
        (OUTPUT / f"{station.trace_id}.station.xml").read_bytes(),
        event,
    ) for station in STATIONS]
    return {
        "schema_version": 1,
        "event": event,
        "traces": traces,
        "note": "Observed recordings. Modeled arrival markers are predictions, not analyst-reviewed observed picks. Zero-phase display filtering can spread energy before an onset. Amplitudes are filtered instrumental counts and cannot be compared between instruments as ground motion.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Refresh recording, StationXML and DOI inputs; reviewed catalog facts are unchanged.")
    parser.add_argument("--verify", action="store_true", help="Check all SHA256 values and reproduce the browser JSON offline without writing files.")
    args = parser.parse_args()
    if args.refresh and args.verify:
        parser.error("--refresh and --verify are mutually exclusive")
    manifest_path = OUTPUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if args.verify and not manifest:
        raise ValueError("No captured manifest exists. Run the download command first.")
    if manifest and not args.refresh:
        for name, record in manifest["files"].items():
            content = (OUTPUT / name).read_bytes()
            if sha256(content).hexdigest() != record["sha256"] or len(content) != record["bytes"]:
                raise ValueError(f"Hash or length mismatch for {name}.")
    if args.verify:
        verify_dependencies(manifest, __file__, FACTS)
        expected = (OUTPUT / "tohoku-2011.json").read_bytes()
        if json_bytes(make_fixture()) != expected:
            raise ValueError("Reprocessed browser samples differ from the recorded fixture.")
        print(f"Verified {len(manifest['files'])} hashes and exact offline waveform reproduction.")
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    downloads = manifest.get("downloads", {})
    event_metadata()
    download("https://api.datacite.org/dois/10.7914/SN/IU", "iu-network-doi.json", downloads, args.refresh)
    for station in STATIONS:
        download(query_url("dataselect", station), f"{station.trace_id}.mseed", downloads, args.refresh)
        download(query_url("station", station, level="response", format="xml"), f"{station.trace_id}.station.xml", downloads, args.refresh)
    fixture = make_fixture()
    (OUTPUT / "tohoku-2011.json").write_bytes(json_bytes(fixture))
    names = sorted([*downloads, "tohoku-2011.json"])
    manifest = {
        "schema_version": 1,
        "description": "Captured upstream observations and deterministic browser display derivative. This manifest does not contain predicted or picked arrival times.",
        "tools": {"python": platform.python_version(), "obspy": obspy.__version__, "numpy": np.__version__, "scipy": scipy.__version__},
        "producer_script_sha256": sha256(Path(__file__).read_bytes()).hexdigest(),
        "producer_dependencies": dependency_hashes(__file__, FACTS),
        "downloads": downloads,
        "files": {name: {"sha256": sha256((OUTPUT / name).read_bytes()).hexdigest(), "bytes": (OUTPUT / name).stat().st_size} for name in names},
        "credit": fixture["traces"][0]["source"]["credit"],
        "data_policy": {"url": POLICY_URL, "basis": "The IU network DOI identifies Albuquerque Seismological Laboratory/USGS as creator. USGS-authored or produced data are in the U.S. public domain. The original and modified observations retain source attribution.", "doi_metadata_rights_list": "The IU DOI metadata has no explicit rightsList entry. No Creative Commons license is inferred from that empty field."},
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    for trace in fixture["traces"]:
        print(f"{trace['id']}: {trace['sample_count']} display samples at {trace['sample_rate_hz']} Hz, distance {trace['distance_deg']:.6f} degrees, original samples {trace['raw']['sample_count']}.")


if __name__ == "__main__":
    main()
