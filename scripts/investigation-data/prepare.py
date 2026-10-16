#!/usr/bin/env python3
"""Capture real Tohoku picks and recordings, or reproduce their display data offline."""

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import platform
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import obspy
from obspy import UTCDateTime, read, read_inventory
from obspy.geodetics import locations2degrees
import scipy
from scipy.signal import resample_poly


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from catalog_facts import as_picks, dependency_hashes, load_facts, verify_dependencies

OUTPUT = ROOT / "fixtures/investigation"
FACTS = OUTPUT / "catalog-facts.json"
PHASE_URL = "https://earthquake.usgs.gov/product/phase-data/official20110311054624120_30/official/1478119914480/quakeml.xml"
EVENT_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/official20110311054624120_30.geojson"
DOI_URL = "https://api.datacite.org/dois/10.7914/SN/IU"
POLICY_URL = "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits"
SERVICE = "https://service.iris.edu/fdsnws"
ORIGIN = UTCDateTime("2011-03-11T05:46:24.120Z")
START = ORIGIN - 60
END = ORIGIN + 2700
PROCESSING = [
    "Ignore zero-sample MiniSEED records and join exactly contiguous positive-sample records. No gaps are interpolated.",
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
    reason: str

    @property
    def id(self):
        return f"IU.{self.code}.00.BHZ"


STATIONS = (
    Station("TATO", "Southwest ray and nearest selected station, chosen for geographic coverage."),
    Station("GUMO", "Southern ray at a shorter distance, chosen for geographic coverage."),
    Station("COLA", "Northeast ray to Alaska, chosen for geographic coverage."),
    Station("KIP", "Eastern ray to Hawaii, chosen for geographic coverage."),
    Station("CTAO", "Southern ray to Australia at a longer distance, chosen for geographic coverage."),
    Station("KEV", "Northwest ray to Finland, chosen for geographic coverage."),
    Station("KONO", "Northwest ray to Norway at a longer distance, chosen for geographic coverage."),
    Station("ANMO", "Northeast ray to New Mexico at a longer distance, chosen for geographic coverage."),
)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()


def url(service, station, **extra):
    return f"{SERVICE}/{service}/1/query?" + urlencode({
        "net": "IU", "sta": station.code, "loc": "00", "cha": "BHZ",
        "starttime": str(START), "endtime": str(END), **extra,
    })


def sources():
    yield "iu-network-doi.json", DOI_URL
    for station in STATIONS:
        yield f"IU.{station.code}.station.xml", url("station", station, level="response", format="xml")
        yield f"{station.id}.mseed", url("dataselect", station, nodata=404)


def acquire(name, source_url):
    request = Request(source_url, headers={"User-Agent": "TauP-investigation-lab/1.0"})
    with urlopen(request, timeout=30) as response:
        data = response.read()
        if not data:
            raise ValueError(f"No bytes returned for {name}")
        record = {
            "requested_url": source_url,
            "response_url": response.geturl(),
            "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
            "content_type": response.headers.get("Content-Type"),
        }
    path = OUTPUT / name
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)
    return record


def station_observation(station, event, picks):
    candidates = [p for p in picks if p.waveform_id.station_code == station.code and p.phase_hint == "P"]
    if len(candidates) != 1:
        raise ValueError(f"Expected one upstream P pick at {station.code}, got {len(candidates)}")
    pick = candidates[0]
    if pick.evaluation_mode != "manual":
        raise ValueError(f"Expected manual upstream pick at {station.code}")
    inventory = read_inventory(OUTPUT / f"IU.{station.code}.station.xml")
    epoch = inventory.select(network="IU", station=station.code, location="00", channel="BHZ", time=ORIGIN)
    if len(epoch) != 1 or len(epoch[0]) != 1 or len(epoch[0][0]) != 1:
        raise ValueError(f"Ambiguous metadata epoch for {station.id}")
    site = epoch[0][0]
    channel = site[0]
    if site.restricted_status != "open" or channel.restricted_status != "open" or channel.dip != -90:
        raise ValueError(f"Expected open vertical channel at {station.id}")
    stream = read(OUTPUT / f"{station.id}.mseed", format="MSEED")
    raw_records = len(stream)
    positive = obspy.Stream([t for t in stream if t.stats.npts > 0])
    if any(t.id != station.id or t.stats.sampling_rate != 20 for t in positive):
        raise ValueError(f"Unexpected source channels or sample rates at {station.id}")
    positive.merge(method=0)
    if len(positive) != 1 or np.ma.isMaskedArray(positive[0].data):
        raise ValueError(f"Waveform is not contiguous at {station.id}")
    trace = positive[0]
    if trace.stats.npts != 55200 or channel.sample_rate != 20:
        raise ValueError(f"Unexpected sample grid for {station.id}")
    if abs(trace.stats.starttime - START) > .05 or abs(trace.stats.endtime - END) > .05:
        raise ValueError(f"Waveform timing is outside a source sample at {station.id}")
    if not trace.stats.starttime < pick.time < trace.stats.endtime:
        raise ValueError(f"Manual pick falls outside recording at {station.id}")
    processed = trace.copy()
    processed.data = processed.data.astype(np.float64)
    processed.detrend("linear")
    processed.taper(max_percentage=.02, type="cosine", max_length=30)
    processed.filter("bandpass", freqmin=.02, freqmax=.2, corners=4, zerophase=True)
    samples = resample_poly(processed.data, 1, 20, window=("kaiser", 5.0), padtype="constant")
    if not np.isfinite(samples).all() or np.ptp(samples) == 0:
        raise ValueError(f"Invalid display recording at {station.id}")
    a, b = np.deg2rad([event["latitude_deg"], channel.latitude])
    delta = np.deg2rad(channel.longitude - event["longitude_deg"])
    azimuth = float(np.rad2deg(np.arctan2(np.sin(delta) * np.cos(b), np.cos(a) * np.sin(b) - np.sin(a) * np.cos(b) * np.cos(delta))) % 360)
    return {
        "id": station.id,
        "code": station.code,
        "name": site.site.name,
        "latitude_deg": channel.latitude,
        "longitude_deg": channel.longitude,
        "elevation_m": channel.elevation,
        "distance_deg": float(locations2degrees(event["latitude_deg"], event["longitude_deg"], channel.latitude, channel.longitude)),
        "azimuth_deg": azimuth,
        "selection_reason": station.reason,
        "observed_pick": {
            "phase": pick.phase_hint,
            "time_utc": str(pick.time),
            "offset_s": pick.time - ORIGIN,
            "evaluation_mode": str(pick.evaluation_mode),
            "uncertainty_s": pick.time_errors.uncertainty,
            "lower_uncertainty_s": pick.time_errors.lower_uncertainty,
            "upper_uncertainty_s": pick.time_errors.upper_uncertainty,
            "resource_id": str(pick.resource_id),
            "reported_waveform_id": pick.waveform_id.get_seed_string(),
            "recording_match": "Station code matched. Upstream pick reports network IR and omits channel and location; it does not identify this particular BHZ trace. IU.00.BHZ is an independent open recording at the station and event-time epoch.",
            "source_url": PHASE_URL,
        },
        "trace": {
            "id": station.id,
            "start_time_utc": str(trace.stats.starttime),
            "start_offset_s": trace.stats.starttime - ORIGIN,
            "sample_rate_hz": 1,
            "sample_count": len(samples),
            "units": "counts",
            "component": "Vertical, StationXML dip -90 degrees",
            "instrument_response_removed": False,
            "samples": np.round(samples, 3).tolist(),
            "processing": PROCESSING,
            "raw": {"start_time_utc": str(trace.stats.starttime), "end_time_utc": str(trace.stats.endtime), "sample_rate_hz": 20, "sample_count": trace.stats.npts, "parsed_record_groups": raw_records, "positive_record_groups": sum(t.stats.npts > 0 for t in stream)},
            "source": {"waveform_url": url("dataselect", station, nodata=404), "station_url": url("station", station, level="response", format="xml"), "network_doi": "https://doi.org/10.7914/SN/IU", "license_url": POLICY_URL},
            "raw_mseed_path": f"fixtures/investigation/{station.id}.mseed",
            "stationxml_path": f"fixtures/investigation/IU.{station.code}.station.xml",
        },
    }


def make_case():
    facts = load_facts(FACTS)
    catalog_event = facts["event"]
    if catalog_event["origin_time_utc"] != str(ORIGIN) or facts["phase"]["source_url"] != PHASE_URL:
        raise ValueError("Reviewed catalog facts differ from the configured event")
    event = {"id": catalog_event["id"], "name": "2011 Tohoku earthquake", "origin_time_utc": str(ORIGIN), "latitude_deg": catalog_event["latitude_deg"], "longitude_deg": catalog_event["longitude_deg"], "depth_km": catalog_event["depth_km"], "magnitude": catalog_event["magnitude"], "source_url": EVENT_URL}
    observations = [station_observation(station, event, as_picks(facts)) for station in STATIONS]
    return {
        "schema_version": 1,
        "event": event,
        "stations": observations,
        "challenge": {
            "fixed_depth_km": 29,
            "origin_time": "fit",
            "region": {"latitude_min_deg": 20, "latitude_max_deg": 55, "longitude_min_deg": 120, "longitude_max_deg": 165},
            "default_station_ids": [s.id for s in STATIONS],
            "arrival_rule": "Earliest modeled uppercase P arrival at the candidate distance.",
            "objective": "Equal-weight root-mean-square residual in seconds, after fitting a common origin-time offset to the selected manual picks.",
            "limitations": [
                "Depth is fixed at 29 km and receivers are modeled at the surface of spherical IASP91.",
                "Origin-time offset is fitted from observations and is not treated as known.",
                "Upstream manual picks have no stated time uncertainty. Equal weighting is an exercise choice, not a measurement of confidence.",
                "The QuakeML network IR and absent channel do not identify a specific sensor. Recordings are independently matched by station code and event-time StationXML.",
                "The historical catalog location is a reference, not an exact answer guaranteed by these eight picks and a one-dimensional model.",
                "Residual contours and station-dropout differences are sensitivity displays, not calibrated statistical confidence regions.",
                "Observed amplitudes are filtered instrumental counts without response removal. They are not comparable ground-motion measurements.",
                "Zero-phase filtering may spread energy before an onset. Analyst picks come from the archived phase file, not this display filter or model.",
            ],
        },
        "provenance": {
            "pick_source_url": PHASE_URL,
            "pick_event_resource_id": facts["phase"]["event_resource_id"],
            "all_source_pick_count": facts["phase"]["all_source_pick_count"],
            "source_manual_p_count": facts["phase"]["source_manual_p_count"],
            "credit": "Albuquerque Seismological Laboratory/USGS (1988), Global Seismograph Network (GSN - IRIS/USGS), doi:10.7914/SN/IU. Recordings accessed through the EarthScope-operated data service. Manual P picks and event parameters from USGS ANSS phase data.",
            "data_policy": {"url": POLICY_URL, "basis": "The IU DOI identifies Albuquerque Seismological Laboratory/USGS as creator. USGS-authored or produced data are in the U.S. public domain. Source attribution is retained.", "doi_rights_list": json.loads((OUTPUT / "iu-network-doi.json").read_bytes())["data"]["attributes"].get("rightsList", []), "note": "An empty DOI rights list is not a Creative Commons license declaration."},
            "distance_convention": "Spherical geographic great-circle distance without geocentric latitude correction.",
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Refresh recording, StationXML and DOI inputs; reviewed catalog facts are unchanged.")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.refresh and args.verify:
        parser.error("--refresh and --verify are mutually exclusive")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / "manifest.json"
    manifest = json.loads(manifest_path.read_bytes()) if manifest_path.exists() else None
    if manifest and not args.refresh:
        for name, expected in manifest["files"].items():
            data = (OUTPUT / name).read_bytes()
            if sha256(data).hexdigest() != expected["sha256"] or len(data) != expected["bytes"]:
                raise ValueError(f"Source hash or size mismatch at {name}")
    if args.verify:
        if not manifest:
            raise ValueError("Capture source data first")
        verify_dependencies(manifest, __file__, FACTS)
        if manifest.get("producer_script_sha256") != sha256(Path(__file__).read_bytes()).hexdigest():
            raise ValueError("Producer script differs from the recorded version. Rebuild and review the fixture manifest.")
        if json_bytes(make_case()) != (OUTPUT / "tohoku-investigation.json").read_bytes():
            raise ValueError("Offline reprocessing differs from recorded case data")
        print(f"Verified {len(manifest['files'])} hashes and exact offline reproduction of eight real recordings and manual picks.")
        return
    records = dict(manifest["downloads"]) if manifest else {}
    for name, source_url in sources():
        if args.refresh or not manifest:
            records[name] = acquire(name, source_url)
            print(f"Captured {name}", flush=True)
        elif records[name]["requested_url"] != source_url:
            raise ValueError(f"Source URL changed at {name}")
    case = make_case()
    (OUTPUT / "tohoku-investigation.json").write_bytes(json_bytes(case))
    names = sorted([*records, "catalog-facts.json", "tohoku-investigation.json"])
    manifest = {
        "schema_version": 1,
        "description": "Real archived manual P picks and actual instrumental recordings. No generated or modeled picks.",
        "tools": {"python": platform.python_version(), "obspy": obspy.__version__, "numpy": np.__version__, "scipy": scipy.__version__},
        "producer_script_sha256": sha256(Path(__file__).read_bytes()).hexdigest(),
        "producer_dependencies": dependency_hashes(__file__, FACTS),
        "downloads": records,
        "files": {name: {"sha256": sha256((OUTPUT / name).read_bytes()).hexdigest(), "bytes": (OUTPUT / name).stat().st_size} for name in names},
        "selection": {"rule": "Select eight IU stations with manual P picks for geographic spread and accessible open vertical recordings. Keep every selected station regardless of model residual.", "selected_before_fitting": [s.code for s in STATIONS], "unavailable_selected_stations": []},
    }
    manifest_path.write_bytes(json_bytes(manifest))
    print(f"Captured {len(case['stations'])} stations with {sum(s['trace']['sample_count'] for s in case['stations'])} displayed samples.")


if __name__ == "__main__":
    main()
