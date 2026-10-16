#!/usr/bin/env python3
"""Capture two curated earthquake replays and verify their derivatives offline."""

import argparse
from datetime import datetime, timezone
from hashlib import sha256
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

from catalog_facts import as_picks, dependency_hashes, load_facts, verify_dependencies
from display_quantization import display_samples, geographic_degrees


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "fixtures/events"
AUDIT = ROOT / ".audit/atlas"
SERVICE = "https://service.iris.edu/fdsnws"
DOI_URL = "https://api.datacite.org/dois/10.7914/SN/IU"
POLICY_URL = "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits"
EVENTS = {
    "maule-2010": {
        "event_id": "official20100227063411530_30",
        "name": "2010 Maule earthquake",
        "expected": [-72.898, -36.122, 22.9, 1267252451530, 8.8],
        "phase_url": "https://earthquake.usgs.gov/product/phase-data/official20100227063411530_30/official/1478119680198/quakeml.xml",
        "summary": "A shallow Chilean megathrust earthquake recorded from nearby Chile to nearly the opposite side of Earth.",
        "stations": {
            "LVC": "Nearby Chilean receiver selected for a short source-to-station path.",
            "ANMO": "North American receiver selected for a mantle path to New Mexico.",
            "KIP": "Hawaiian receiver selected for a long Pacific mantle path.",
            "KONO": "Norwegian receiver selected for northern Atlantic coverage.",
            "CTAO": "Australian receiver selected for southern Pacific coverage.",
            "TATO": "Taiwanese receiver selected for a nearly antipodal core-transiting path.",
        },
    },
    "okhotsk-2013": {
        "event_id": "usb000h4jh",
        "name": "2013 Sea of Okhotsk earthquake",
        "expected": [153.221, 54.892, 598.1, 1369374288980, 8.3],
        "phase_url": "https://earthquake.usgs.gov/product/phase-data/usb000h4jh/us/1415325053714/quakeml.xml",
        "summary": "A deep earthquake beneath the Sea of Okhotsk, with paths beginning inside the mantle rather than near the surface.",
        "stations": {
            "MAJO": "Japanese receiver selected for the nearest northern Pacific path.",
            "TATO": "Taiwanese receiver selected for southwestern coverage.",
            "COLA": "Alaskan receiver selected for northeastern coverage.",
            "KIP": "Hawaiian receiver selected for an eastern Pacific path.",
            "ANMO": "New Mexico receiver selected for a longer mantle path.",
            "LVC": "Chilean receiver selected for an inner-core-transiting path.",
        },
    },
}
PROCESSING = [
    "Ignore zero-sample MiniSEED records and join exactly contiguous positive-sample records. No gaps are interpolated.",
    "Convert raw integer instrumental counts to float64.",
    "Remove the least-squares linear trend over the complete trace.",
    "Apply a cosine taper to 2 percent at each end, limited to 30 seconds.",
    "Apply a 4-corner, zero-phase Butterworth bandpass at 0.02 to 0.2 Hz.",
    "Resample 20 Hz to 1 Hz with scipy.signal.resample_poly, up=1, down=20, window=('kaiser', 5.0), padtype='constant'. This includes an anti-alias FIR filter.",
    "Round the displayed count samples to one decimal place using decimal round-half-even. Preserve the raw MiniSEED separately.",
]
LIMITATIONS = [
    "Replay and path exploration only. No validated source-location exercise is provided for this event.",
    "Catalog source depth and location are fixed historical references. IASP91 is a spherical one-dimensional model with surface receivers.",
    "Only modeled P, S and PKIKP are supported. A missing modeled arrival is not proof that the real station recorded no seismic energy.",
    "Manual P picks come from the archived USGS phase file. Stations without a unique manual P pick retain no observed pick.",
    "An upstream pick reporting network IR without channel and location is matched by station code and event-time metadata. It does not identify this particular BHZ sensor.",
    "Reported pick uncertainty is retained, including null values. A null uncertainty is not a claim of exact timing.",
    "Filtered instrumental counts have no response removal. They are not calibrated displacement, velocity or acceleration, and amplitudes are not comparable between stations.",
    "Zero-phase filtering can spread energy before an onset. The display filter and modeled times do not generate observed picks.",
    "Model mismatch, finite source duration, Earth structure and phase-label differences can separate picks, visible signal and one-dimensional predictions.",
]


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()


def event_url(config):
    return f"https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/{config['event_id']}.geojson"


def station_url(config, code, service):
    origin = UTCDateTime(config["expected"][3] / 1000)
    extra = {"level": "response", "format": "xml"} if service == "station" else {"nodata": 404}
    return f"{SERVICE}/{service}/1/query?" + urlencode({
        "net": "IU", "sta": code, "loc": "00", "cha": "BHZ",
        "starttime": str(origin - 60), "endtime": str(origin + 2700), **extra,
    })


def source_urls(config):
    yield "iu-network-doi.json", DOI_URL
    for code in config["stations"]:
        yield f"IU.{code}.station.xml", station_url(config, code, "station")
        yield f"IU.{code}.00.BHZ.mseed", station_url(config, code, "dataselect")


def acquire(directory, name, url, attempts):
    record = {"file": name, "requested_url": url, "attempted_at_utc": datetime.now(timezone.utc).isoformat()}
    try:
        with urlopen(Request(url, headers={"User-Agent": "TauP-investigation-lab/1.1"}), timeout=30) as response:
            data = response.read()
            if not data:
                raise ValueError(f"Empty response for {name}")
            record.update({
                "response_url": response.geturl(),
                "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
                "content_type": response.headers.get("Content-Type"),
                "status": "captured",
                "bytes": len(data),
            })
        temporary = directory / f"{name}.tmp"
        temporary.write_bytes(data)
        temporary.replace(directory / name)
        return record
    except Exception as error:
        record.update({"status": "failed", "error": str(error)})
        raise
    finally:
        attempts.append(record)


def verify_files(directory, manifest):
    for name, expected in manifest["files"].items():
        data = (directory / name).read_bytes()
        if len(data) != expected["bytes"] or sha256(data).hexdigest() != expected["sha256"]:
            raise ValueError(f"Source hash or size mismatch at {directory.name}/{name}")


def manual_pick(code, picks, origin, trace, source_url):
    candidates = [p for p in picks if p.waveform_id.station_code == code and p.phase_hint == "P" and p.evaluation_mode == "manual"]
    if not candidates:
        return None
    if len(candidates) != 1:
        raise ValueError(f"Ambiguous manual P pick for {code}")
    pick = candidates[0]
    if not trace.stats.starttime < pick.time < trace.stats.endtime:
        raise ValueError(f"Manual P pick outside recording at {code}")
    waveform = pick.waveform_id
    if waveform.network_code != "IR" or waveform.channel_code or waveform.location_code:
        raise ValueError(f"Pick metadata changed at {code}. Review the exact sensor match.")
    return {
        "phase": "P", "time_utc": str(pick.time), "offset_s": pick.time - origin,
        "evaluation_mode": "manual", "uncertainty_s": pick.time_errors.uncertainty,
        "lower_uncertainty_s": pick.time_errors.lower_uncertainty,
        "upper_uncertainty_s": pick.time_errors.upper_uncertainty,
        "resource_id": str(pick.resource_id), "reported_waveform_id": waveform.get_seed_string(),
        "recording_match": "Station code matched. Upstream pick reports network IR and omits channel and location; it does not identify this particular BHZ trace. IU.00.BHZ is an independent open recording at the station and event-time epoch.",
        "source_url": source_url,
    }


def station_observation(directory, config, code, event, picks):
    station_id = f"IU.{code}.00.BHZ"
    origin = UTCDateTime(event["origin_time_utc"])
    inventory = read_inventory(directory / f"IU.{code}.station.xml")
    epoch = inventory.select(network="IU", station=code, location="00", channel="BHZ", time=origin)
    if len(epoch) != 1 or len(epoch[0]) != 1 or len(epoch[0][0]) != 1:
        raise ValueError(f"Ambiguous event-time metadata for {station_id}")
    site = epoch[0][0]
    channel = site[0]
    if site.restricted_status != "open" or channel.restricted_status != "open" or channel.dip != -90 or channel.sample_rate != 20:
        raise ValueError(f"Expected an open 20 Hz vertical channel for {station_id}")
    raw = read(directory / f"{station_id}.mseed", format="MSEED")
    positive = obspy.Stream([t for t in raw if t.stats.npts > 0])
    if any(t.id != station_id or t.stats.sampling_rate != 20 for t in positive):
        raise ValueError(f"Unexpected raw channel or sample rate for {station_id}")
    if positive.get_gaps():
        raise ValueError(f"Raw records have gaps or overlaps for {station_id}")
    positive.merge(method=0)
    if len(positive) != 1 or np.ma.isMaskedArray(positive[0].data):
        raise ValueError(f"Raw recording is not contiguous for {station_id}")
    trace = positive[0]
    if trace.stats.npts != 55200:
        raise ValueError(f"Expected 55,200 raw samples at {station_id}")
    if abs(trace.stats.starttime - (origin - 60)) > .05 or abs(trace.stats.endtime - (origin + 2700)) > .05:
        raise ValueError(f"Raw recording clock outside one sample at {station_id}")
    observed_pick = manual_pick(code, picks, origin, trace, config["phase_url"])
    processed = trace.copy()
    processed.data = processed.data.astype(np.float64)
    processed.detrend("linear")
    processed.taper(max_percentage=.02, type="cosine", max_length=30)
    processed.filter("bandpass", freqmin=.02, freqmax=.2, corners=4, zerophase=True)
    samples = resample_poly(processed.data, 1, 20, window=("kaiser", 5.0), padtype="constant")
    if not np.isfinite(samples).all() or np.ptp(samples) == 0 or len(samples) != 2760:
        raise ValueError(f"Invalid display recording for {station_id}")
    a, b = np.deg2rad([event["latitude_deg"], channel.latitude])
    delta = np.deg2rad(channel.longitude - event["longitude_deg"])
    azimuth = float(np.rad2deg(np.arctan2(np.sin(delta) * np.cos(b), np.cos(a) * np.sin(b) - np.sin(a) * np.cos(b) * np.cos(delta))) % 360)
    return {
        "id": station_id, "code": code, "name": site.site.name,
        "latitude_deg": channel.latitude, "longitude_deg": channel.longitude,
        "elevation_m": channel.elevation,
        "distance_deg": geographic_degrees(locations2degrees(event["latitude_deg"], event["longitude_deg"], channel.latitude, channel.longitude)),
        "azimuth_deg": geographic_degrees(azimuth), "selection_reason": config["stations"][code],
        "observed_pick": observed_pick,
        "trace": {
            "id": station_id, "start_time_utc": str(trace.stats.starttime),
            "start_offset_s": trace.stats.starttime - origin, "sample_rate_hz": 1,
            "sample_count": len(samples), "units": "counts",
            "component": "Vertical, StationXML dip -90 degrees", "instrument_response_removed": False,
            "samples": display_samples(samples), "processing": PROCESSING,
            "raw": {"start_time_utc": str(trace.stats.starttime), "end_time_utc": str(trace.stats.endtime), "sample_rate_hz": 20, "sample_count": trace.stats.npts, "parsed_record_groups": len(raw), "positive_record_groups": sum(t.stats.npts > 0 for t in raw)},
            "source": {"waveform_url": station_url(config, code, "dataselect"), "station_url": station_url(config, code, "station"), "network_doi": "https://doi.org/10.7914/SN/IU", "license_url": POLICY_URL},
            "raw_mseed_path": f"fixtures/events/{directory.name}/{station_id}.mseed",
            "stationxml_path": f"fixtures/events/{directory.name}/IU.{code}.station.xml",
        },
    }


def make_case(directory, config):
    facts = load_facts(directory / "catalog-facts.json")
    catalog_event = facts["event"]
    if facts["phase"]["source_url"] != config["phase_url"]:
        raise ValueError(f"Reviewed phase URL changed for {directory.name}")
    event = {
        "id": catalog_event["id"], "name": config["name"], "origin_time_utc": catalog_event["origin_time_utc"],
        "latitude_deg": catalog_event["latitude_deg"], "longitude_deg": catalog_event["longitude_deg"], "depth_km": catalog_event["depth_km"],
        "magnitude": catalog_event["magnitude"], "magnitude_type": catalog_event["magnitude_type"], "source_url": event_url(config),
        "summary": config["summary"],
    }
    stations = [station_observation(directory, config, code, event, as_picks(facts)) for code in config["stations"]]
    doi = json.loads((directory / "iu-network-doi.json").read_bytes())["data"]["attributes"]
    if not any("USGS" in creator.get("name", "") for creator in doi["creators"]):
        raise ValueError("The IU creator attribution changed")
    return {
        "schema_version": 1, "event": event, "stations": stations, "challenge": None,
        "provenance": {
            "pick_source_url": config["phase_url"], "pick_event_resource_id": facts["phase"]["event_resource_id"],
            "all_source_pick_count": facts["phase"]["all_source_pick_count"],
            "source_manual_p_count": facts["phase"]["source_manual_p_count"],
            "selected_manual_p_count": sum(s["observed_pick"] is not None for s in stations),
            "credit": "Albuquerque Seismological Laboratory/USGS (1988), Global Seismograph Network (GSN - IRIS/USGS), doi:10.7914/SN/IU. Recordings accessed through the EarthScope-operated data service. Manual P picks and event parameters from USGS ANSS phase data.",
            "data_policy": {"url": POLICY_URL, "basis": "The IU DOI identifies Albuquerque Seismological Laboratory/USGS as creator. USGS-authored or produced data are in the U.S. public domain. Source attribution is retained.", "doi_rights_list": doi.get("rightsList", []), "note": "An empty DOI rights list is not a Creative Commons license declaration."},
            "distance_convention": "Spherical geographic great-circle distance without geocentric latitude correction.",
            "limitations": LIMITATIONS,
        },
    }


def prepare(slug, config, args):
    directory = OUTPUT / slug
    manifest_path = directory / "manifest.json"
    manifest = json.loads(manifest_path.read_bytes()) if manifest_path.exists() else None
    if manifest and not args.refresh:
        verify_files(directory, manifest)
    if args.verify:
        if not manifest:
            raise ValueError(f"Capture {slug} before verification")
        verify_dependencies(manifest, __file__, directory / "catalog-facts.json")
        if manifest["producer_script_sha256"] != sha256(Path(__file__).read_bytes()).hexdigest():
            raise ValueError("Producer script differs from the recorded version. Regenerate and review the manifest.")
        if json_bytes(make_case(directory, config)) != (directory / "case.json").read_bytes():
            raise ValueError(f"Offline reproduction differs for {slug}")
        print(f"Verified {slug}: {len(manifest['files'])} hashes, six contiguous real recordings and byte-exact offline reproduction.")
        return
    directory.mkdir(parents=True, exist_ok=True)
    attempts = []
    records = dict(manifest["downloads"]) if manifest else {}
    try:
        for name, url in source_urls(config):
            if not manifest or args.refresh:
                records[name] = acquire(directory, name, url, attempts)
                print(f"Captured {slug}/{name}", flush=True)
            elif records[name]["requested_url"] != url:
                raise ValueError(f"Source URL changed at {slug}/{name}")
        case = make_case(directory, config)
        (directory / "case.json").write_bytes(json_bytes(case))
        names = sorted([*records, "catalog-facts.json", "case.json"])
        result = {
            "schema_version": 1, "description": "Curated replay with actual recordings and independently archived manual picks where available. No validated source-location exercise.",
            "tools": {"python": platform.python_version(), "obspy": obspy.__version__, "numpy": np.__version__, "scipy": scipy.__version__},
            "producer_script_sha256": sha256(Path(__file__).read_bytes()).hexdigest(),
            "producer_dependencies": dependency_hashes(__file__, directory / "catalog-facts.json"),
            "downloads": records,
            "files": {name: {"sha256": sha256((directory / name).read_bytes()).hexdigest(), "bytes": (directory / name).stat().st_size} for name in names},
            "selection": {"rule": "Choose six stations for geographic and distance coverage before looking at picks or model residuals. Keep every selected station regardless of residual or missing pick.", "selected_before_residuals": list(config["stations"]), "unavailable_selected_stations": [], "failed_requests": [a for a in attempts if a["status"] == "failed"]},
        }
        manifest_path.write_bytes(json_bytes(result))
        print(f"Prepared {slug}: {len(case['stations'])} recordings, {case['provenance']['selected_manual_p_count']} manual P picks, no source fit.")
    finally:
        AUDIT.mkdir(parents=True, exist_ok=True)
        if attempts:
            (AUDIT / f"data-{slug}-requests.json").write_bytes(json_bytes(attempts))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", choices=list(EVENTS))
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--refresh", action="store_true", help="Refresh recording, StationXML and DOI inputs; reviewed catalog facts are unchanged.")
    modes.add_argument("--verify", action="store_true", help="Read-only verification with no network requests.")
    args = parser.parse_args()
    for slug, config in EVENTS.items():
        if args.event is None or args.event == slug:
            prepare(slug, config, args)


if __name__ == "__main__":
    main()
