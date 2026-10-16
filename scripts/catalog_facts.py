#!/usr/bin/env python3
"""Check selected factual catalog inputs against optional private source captures."""

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
from pathlib import Path
import re
from urllib.request import Request, urlopen

from obspy import UTCDateTime, read_events
from obspy.core.event import Pick, QuantityError, WaveformStreamID

ROOT = Path(__file__).resolve().parents[1]
SPECS = {
    "tohoku-2011": ("fixtures/investigation", ("TATO", "GUMO", "COLA", "KIP", "CTAO", "KEV", "KONO", "ANMO"),
                    ("official20110311054624120_30", 142.373, 38.297, 29.0, 1299822384120, 9.1)),
    "maule-2010": ("fixtures/events/maule-2010", ("LVC", "ANMO", "KIP", "KONO", "CTAO", "TATO"),
                   ("official20100227063411530_30", -72.898, -36.122, 22.9, 1267252451530, 8.8)),
    "okhotsk-2013": ("fixtures/events/okhotsk-2013", ("MAJO", "TATO", "COLA", "KIP", "ANMO", "LVC"),
                     ("usb000h4jh", 153.221, 54.892, 598.1, 1369374288980, 8.3)),
}
EVENT_FIELDS = {"id", "origin_time_utc", "latitude_deg", "longitude_deg", "depth_km", "magnitude", "magnitude_type", "place", "event_page_url", "source_url"}
PHASE_FIELDS = {"event_resource_id", "source_url", "all_source_pick_count", "source_manual_p_count", "configured_phase_url_present_in_event"}
PICK_FIELDS = {"resource_id", "station_code", "reported_network", "channel_code", "location_code", "time_utc", "phase", "evaluation_mode", "evaluation_status", "onset", "uncertainty_s", "lower_uncertainty_s", "upper_uncertainty_s", "creator_agency"}
RECEIPT_FIELDS = {"sha256", "bytes", "requested_url", "response_url", "retrieved_at_utc", "content_type"}


def fields(value, expected, label):
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError(f"Unexpected fields in {label}; only the reviewed factual allowlist is accepted")


def validate(facts):
    fields(facts, {"schema_version", "case", "event", "phase", "manual_p_picks", "source_aggregates"}, "catalog facts")
    if facts["schema_version"] != 1 or facts["case"] not in SPECS:
        raise ValueError("Unsupported factual input version or case")
    _, stations, expected = SPECS[facts["case"]]
    event, phase, picks = facts["event"], facts["phase"], facts["manual_p_picks"]
    fields(event, EVENT_FIELDS, "event")
    fields(phase, PHASE_FIELDS, "phase receipt")
    fields(picks, set(stations), "selected stations")
    for key in ("latitude_deg", "longitude_deg", "depth_km", "magnitude"):
        if type(event[key]) not in (int, float) or not math.isfinite(event[key]):
            raise ValueError(f"Invalid event number at {key}")
    actual = (event["id"], event["longitude_deg"], event["latitude_deg"], event["depth_km"], int(round(UTCDateTime(event["origin_time_utc"]).timestamp * 1000)), event["magnitude"])
    if actual != expected:
        raise ValueError("Catalog event differs from the reviewed event selection")
    expected_url = f"https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/{event['id']}.geojson"
    if event["source_url"] != expected_url:
        raise ValueError("Unexpected event source URL")
    selected = [pick for pick in picks.values() if pick is not None]
    for station, pick in picks.items():
        if pick is None:
            if station not in {"maule-2010": {"LVC", "KONO", "TATO"}, "okhotsk-2013": {"LVC"}}.get(facts["case"], set()):
                raise ValueError(f"Previously present selected pick is missing at {station}")
            continue
        fields(pick, PICK_FIELDS, f"pick at {station}")
        if (pick["station_code"], pick["reported_network"], pick["phase"], pick["evaluation_mode"]) != (station, "IR", "P", "manual"):
            raise ValueError(f"Selected pick identity changed at {station}")
        if pick["evaluation_status"] not in (None, "preliminary", "confirmed", "reviewed", "final", "rejected") or pick["onset"] not in (None, "emergent", "impulsive", "questionable"):
            raise ValueError(f"Invalid analyst evaluation at {station}")
        if any(pick[key] is not None for key in ("channel_code", "location_code", "uncertainty_s", "lower_uncertainty_s", "upper_uncertainty_s", "creator_agency")):
            raise ValueError(f"Previously absent source metadata changed at {station}; review it explicitly")
        if not isinstance(pick["resource_id"], str) or not pick["resource_id"] or abs(UTCDateTime(pick["time_utc"]) - UTCDateTime(event["origin_time_utc"])) > 2700:
            raise ValueError(f"Invalid selected pick at {station}")
    if len({pick["resource_id"] for pick in selected}) != len(selected):
        raise ValueError("Duplicate selected pick resource ID")
    if phase["configured_phase_url_present_in_event"] is not True:
        raise ValueError("Phase product is not a member of the archived event response")
    if any(type(phase[key]) is not int for key in ("all_source_pick_count", "source_manual_p_count")) or not len(selected) <= phase["source_manual_p_count"] <= phase["all_source_pick_count"]:
        raise ValueError("Invalid aggregate pick counts")
    receipts = facts["source_aggregates"]
    fields(receipts, {"usgs-event.geojson", "usgs-phase-data.xml"}, "source receipts")
    for name, receipt in receipts.items():
        fields(receipt, RECEIPT_FIELDS, name)
        if not isinstance(receipt["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", receipt["sha256"]) or type(receipt["bytes"]) is not int or receipt["bytes"] <= 0:
            raise ValueError(f"Invalid source fingerprint at {name}")
        for key in ("requested_url", "response_url"):
            if not isinstance(receipt[key], str) or not receipt[key].startswith("https://earthquake.usgs.gov/"):
                raise ValueError(f"Unexpected source host at {name}")
        datetime.fromisoformat(receipt["retrieved_at_utc"])
        if not isinstance(receipt["content_type"], str):
            raise ValueError(f"Missing source content type at {name}")
    if receipts["usgs-event.geojson"]["requested_url"] != event["source_url"] or receipts["usgs-phase-data.xml"]["requested_url"] != phase["source_url"]:
        raise ValueError("Catalog receipt URL differs from its factual source")
    return facts


def load_facts(path):
    return validate(json.loads(Path(path).read_bytes()))


def as_picks(facts):
    return [Pick(resource_id=p["resource_id"], time=UTCDateTime(p["time_utc"]),
                 waveform_id=WaveformStreamID(network_code=p["reported_network"], station_code=p["station_code"], location_code=p["location_code"], channel_code=p["channel_code"]),
                 phase_hint=p["phase"], evaluation_mode=p["evaluation_mode"], evaluation_status=p["evaluation_status"], onset=p["onset"],
                 time_errors=QuantityError(uncertainty=p["uncertainty_s"], lower_uncertainty=p["lower_uncertainty_s"], upper_uncertainty=p["upper_uncertainty_s"]))
            for p in facts["manual_p_picks"].values() if p is not None]


def dependency_hashes(producer, facts_path):
    return {str(path.relative_to(ROOT)): sha256(path.read_bytes()).hexdigest()
            for path in (Path(producer).resolve(), Path(__file__).resolve(), Path(__file__).with_name("display_quantization.py"), Path(facts_path).resolve())}


def verify_dependencies(manifest, producer, facts_path):
    if manifest.get("producer_dependencies") != dependency_hashes(producer, facts_path):
        raise ValueError("Producer or factual input differs from its recorded dependency. Regenerate and review the manifest.")


def extract_facts(source_directory, case, receipts):
    _, stations, _ = SPECS[case]
    for name, receipt in receipts.items():
        data = (source_directory / name).read_bytes()
        if len(data) != receipt["bytes"] or sha256(data).hexdigest() != receipt["sha256"]:
            raise ValueError(f"Source bytes changed at {name}. Captured bytes remain private; review the changed source explicitly.")
    raw = json.loads((source_directory / "usgs-event.geojson").read_bytes())
    longitude, latitude, depth = raw["geometry"]["coordinates"]
    properties = raw["properties"]
    catalog = read_events(source_directory / "usgs-phase-data.xml")
    if len(catalog) != 1:
        raise ValueError("Expected exactly one source phase event")
    phase_url = receipts["usgs-phase-data.xml"]["requested_url"]
    picks = {}
    for code in stations:
        candidates = [p for p in catalog[0].picks if p.waveform_id.station_code == code and p.phase_hint == "P" and (case == "tohoku-2011" or p.evaluation_mode == "manual")]
        if len(candidates) > 1:
            raise ValueError(f"Ambiguous manual P pick at {code}")
        if not candidates:
            picks[code] = None
            continue
        p = candidates[0]
        if p.evaluation_mode != "manual":
            raise ValueError(f"Expected manual upstream pick at {code}")
        picks[code] = {
            "resource_id": str(p.resource_id), "station_code": code, "reported_network": p.waveform_id.network_code,
            "channel_code": p.waveform_id.channel_code, "location_code": p.waveform_id.location_code,
            "time_utc": str(p.time), "phase": p.phase_hint, "evaluation_mode": str(p.evaluation_mode),
            "evaluation_status": str(p.evaluation_status) if p.evaluation_status else None, "onset": str(p.onset) if p.onset else None,
            "uncertainty_s": p.time_errors.uncertainty, "lower_uncertainty_s": p.time_errors.lower_uncertainty,
            "upper_uncertainty_s": p.time_errors.upper_uncertainty,
            "creator_agency": p.creation_info.agency_id if p.creation_info else None,
        }
    return validate({
        "schema_version": 1, "case": case,
        "event": {"id": raw["id"], "origin_time_utc": str(UTCDateTime(properties["time"] / 1000)),
                  "latitude_deg": latitude, "longitude_deg": longitude, "depth_km": depth,
                  "magnitude": properties["mag"], "magnitude_type": properties["magType"],
                  "place": properties["place"], "event_page_url": properties["url"],
                  "source_url": receipts["usgs-event.geojson"]["requested_url"]},
        "phase": {"event_resource_id": str(catalog[0].resource_id), "source_url": phase_url,
                  "all_source_pick_count": len(catalog[0].picks),
                  "source_manual_p_count": sum(p.phase_hint == "P" and p.evaluation_mode == "manual" for p in catalog[0].picks),
                  "configured_phase_url_present_in_event": phase_url in [c["url"] for p in properties["products"].get("phase-data", []) for c in p["contents"].values()]},
        "manual_p_picks": picks, "source_aggregates": receipts,
    })


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=SPECS, help="Check one case instead of all three.")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--source-root", type=Path, help="Read private captures at ROOT/fixtures/...; default .cache/source-archives.")
    modes.add_argument("--reacquire", action="store_true", help="Capture into ignored .cache and compare; never replace qualified factual inputs.")
    args = parser.parse_args()
    source_root = args.source_root or ROOT / ".cache/source-archives"
    if args.reacquire:
        source_root = ROOT / ".cache/source-archives" / datetime.now(timezone.utc).strftime("reacquired-%Y%m%dT%H%M%S.%fZ")
    for case, (directory, _, _) in SPECS.items():
        if args.case and args.case != case:
            continue
        frozen = load_facts(ROOT / directory / "catalog-facts.json")
        source_directory = source_root / directory
        if args.reacquire:
            source_directory.mkdir(parents=True, exist_ok=True)
            for name, receipt in frozen["source_aggregates"].items():
                request = Request(receipt["requested_url"], headers={"User-Agent": "Earthquake-Lab-factual-provenance/1.0"})
                with urlopen(request, timeout=30) as response:
                    data = response.read()
                    (source_directory / name).write_bytes(data)
                    acquired = {"requested_url": receipt["requested_url"], "response_url": response.geturl(), "retrieved_at_utc": datetime.now(timezone.utc).isoformat(), "content_type": response.headers.get("Content-Type"), "sha256": sha256(data).hexdigest(), "bytes": len(data)}
                    (source_directory / f"{name}.receipt.json").write_text(json.dumps(acquired, indent=2) + "\n")
            print(f"Private source capture retained at {source_directory}", flush=True)
        actual = extract_facts(source_directory, case, frozen["source_aggregates"])
        if actual != frozen:
            raise ValueError(f"Selected catalog facts differ from the reviewed input for {case}")
        print(f"Verified {case}: exact original source fingerprints, fixed station selection, event membership, counts and selected facts.")


if __name__ == "__main__":
    main()
