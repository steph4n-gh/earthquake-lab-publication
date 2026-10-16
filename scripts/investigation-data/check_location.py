#!/usr/bin/env python3
"""Independently fit archived manual P picks with ObsPy IASP91 and SciPy."""

from hashlib import sha256
import json
from pathlib import Path
import subprocess

import numpy as np
import obspy
from obspy.taup import TauPyModel
import scipy
from scipy.optimize import least_squares


ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "fixtures/investigation/tohoku-investigation.json"
REPORT = ROOT / ".audit/lab/data-feasibility.json"


def distances(latitude, longitude, stations):
    a, b = np.deg2rad([latitude, longitude])
    station_latitudes = np.deg2rad([s["latitude_deg"] for s in stations])
    station_longitudes = np.deg2rad([s["longitude_deg"] for s in stations])
    haversine = np.sin((station_latitudes - a) / 2) ** 2 + np.cos(a) * np.cos(station_latitudes) * np.sin((station_longitudes - b) / 2) ** 2
    return np.rad2deg(2 * np.arcsin(np.sqrt(np.clip(haversine, 0, 1))))


def predict(model, latitude, longitude, stations):
    output = []
    for distance in distances(latitude, longitude, stations):
        arrivals = model.get_travel_times(29, float(distance), ["P"], ray_param_tol=1e-8)
        if not arrivals:
            raise ValueError(f"No direct P at distance {distance}")
        output.append(min(a.time for a in arrivals))
    return np.array(output)


def fit(model, stations, start):
    observed = np.array([s["observed_pick"]["offset_s"] for s in stations])

    def residual(position):
        try:
            difference = observed - predict(model, *position, stations)
            return difference - difference.mean()
        except ValueError:
            return np.full(len(stations), 10000.)

    fit_result = least_squares(residual, start, bounds=([20, 120], [55, 165]), diff_step=1e-5, ftol=1e-10, xtol=1e-10, gtol=1e-9, max_nfev=150)
    latitude, longitude = fit_result.x
    times = predict(model, latitude, longitude, stations)
    offset = float(np.mean(observed - times))
    remaining = observed - times - offset
    return {
        "latitude_deg": float(latitude), "longitude_deg": float(longitude),
        "origin_offset_s": offset, "rms_s": float(np.sqrt(np.mean(remaining ** 2))),
        "station_ids": [s["id"] for s in stations], "start": list(start),
        "optimizer_success": bool(fit_result.success), "evaluations": int(fit_result.nfev),
        "residuals": [{"station_id": station["id"], "distance_deg": float(distance), "predicted_p_s": float(time), "observed_pick_s": float(pick), "residual_s": float(residual)} for station, distance, time, pick, residual in zip(stations, distances(latitude, longitude, stations), times, observed, remaining)],
    }


def offset_km(position, event):
    return float(distances(position["latitude_deg"], position["longitude_deg"], [event])[0] * np.pi / 180 * 6371)


def native(stations, latitude, longitude):
    query = [{"depth_km": 29, "distance_deg": float(d)} for d in distances(latitude, longitude, stations)]
    process = subprocess.run([str(ROOT / "target/release/taup"), "--batch"], input=json.dumps(query), text=True, capture_output=True, check=True)
    output = json.loads(process.stdout)
    return np.array([min(a["time_s"] for a in arrivals if a["phase"] == "P") for arrivals in output])


def main():
    case = json.loads(CASE.read_bytes())
    event, stations = case["event"], case["stations"]
    model = TauPyModel("iasp91")
    observed = np.array([s["observed_pick"]["offset_s"] for s in stations])
    catalog_predictions = predict(model, event["latitude_deg"], event["longitude_deg"], stations)
    catalog_native = native(stations, event["latitude_deg"], event["longitude_deg"])
    catalog_differences = observed - catalog_predictions
    starts = [(32, 140), (45, 150), (30, 160)]
    full_fits = [fit(model, stations, start) for start in starts]
    best = min(full_fits, key=lambda result: result["rms_s"])
    best["catalog_offset_km"] = offset_km(best, event)
    best_predictions = predict(model, best["latitude_deg"], best["longitude_deg"], stations)
    best_native = native(stations, best["latitude_deg"], best["longitude_deg"])
    dropouts = []
    for excluded in stations:
        subset = [s for s in stations if s is not excluded]
        result = fit(model, subset, (best["latitude_deg"], best["longitude_deg"]))
        result["excluded_station"] = excluded["id"]
        result["catalog_offset_km"] = offset_km(result, event)
        result["full_fit_offset_km"] = offset_km(result, best)
        dropouts.append(result)
    four = [s for s in stations if s["code"] in ["TATO", "GUMO", "COLA", "KIP"]]
    four_fit = fit(model, four, (32, 140))
    four_fit["catalog_offset_km"] = offset_km(four_fit, event)
    two = [s for s in stations if s["code"] in ["COLA", "KIP"]]
    two_fits = [fit(model, two, start) for start in [(25, 135), (35, 155), (48, 140)]]
    for result in two_fits:
        result["catalog_offset_km"] = offset_km(result, event)
    pair_separation = max(offset_km(a, b) for a in two_fits for b in two_fits)
    azimuths = sorted(s["azimuth_deg"] for s in stations)
    gap = max(b - a for a, b in zip(azimuths, [*azimuths[1:], azimuths[0] + 360]))
    native_error = max(float(np.max(np.abs(catalog_predictions - catalog_native))), float(np.max(np.abs(best_predictions - best_native))))
    verdict = len(stations) == 8 and gap < 120 and best["rms_s"] < 3 and best["catalog_offset_km"] < 100 and native_error < .1 and pair_separation > 100 and all(x["rms_s"] < .1 for x in two_fits)
    report = {
        "status": "PASS" if verdict else "FAIL",
        "claim": "These independently sourced manual picks and obtainable recordings support a bounded educational source-location exercise. They do not exactly reproduce the catalog hypocenter or establish calibrated uncertainty.",
        "tools": {"obspy": obspy.__version__, "scipy": scipy.__version__, "numpy": np.__version__},
        "provenance": {"case_sha256": sha256(CASE.read_bytes()).hexdigest(), "native_binary_sha256": sha256((ROOT / "target/release/taup").read_bytes()).hexdigest(), "native_source_sha256": sha256((ROOT / "crates/taup-core/src/lib.rs").read_bytes()).hexdigest(), "model_file_sha256": sha256((ROOT / "fixtures/iasp91.json").read_bytes()).hexdigest(), "source_manifest_sha256": sha256((ROOT / "fixtures/investigation/manifest.json").read_bytes()).hexdigest(), "control_script_sha256": sha256(Path(__file__).read_bytes()).hexdigest(), "reference_requirements_sha256": sha256((ROOT / "requirements-reference.txt").read_bytes()).hexdigest()},
        "selection": {"station_count": len(stations), "selected_before_fitting": [s["id"] for s in stations], "missing_selected_recordings": [], "stations_removed_for_residual": [], "maximum_azimuthal_gap_deg": gap, "catalog_distance_range_deg": [min(s["distance_deg"] for s in stations), max(s["distance_deg"] for s in stations)]},
        "assumptions": {"depth_km": 29, "depth_fitted": False, "origin_time_fitted": True, "earth_model": "IASP91 spherical", "receivers": "Surface. Station elevation and sensor depth omitted by model.", "arrival": "Earliest uppercase P", "station_weights": "Equal. Pick uncertainties absent in upstream XML.", "distance": "Independent haversine on geographic latitudes. No geocentric correction."},
        "catalog_geometry": {"latitude_deg": event["latitude_deg"], "longitude_deg": event["longitude_deg"], "rms_at_catalog_origin_s": float(np.sqrt(np.mean(catalog_differences ** 2))), "fitted_origin_offset_s": float(catalog_differences.mean()), "rms_with_fitted_origin_s": float(np.sqrt(np.mean((catalog_differences - catalog_differences.mean()) ** 2))), "stations": [{"station_id": s["id"], "observed_pick_s": float(o), "predicted_p_s": float(p), "residual_at_catalog_origin_s": float(o - p)} for s, o, p in zip(stations, observed, catalog_predictions)]},
        "all_station_best_fit": best,
        "multistart_fits": full_fits,
        "four_station_fit": four_fit,
        "leave_one_out": dropouts,
        "two_station_ambiguity": {"stations": [s["id"] for s in two], "fits_from_three_starts": two_fits, "maximum_separation_km": pair_separation, "interpretation": "Different source points fit the same two arrival picks after origin-time fitting. Their small residual is not evidence of a unique location."},
        "independent_native_check": {"locations_checked": ["catalog", "eight-station SciPy best fit"], "arrivals_checked": 16, "maximum_native_vs_obspy_first_p_error_s": native_error},
        "gate": {"station_count": "Exactly eight actual recordings and manual picks", "maximum_azimuthal_gap_deg": 120, "eight_station_rms_s": 3, "catalog_offset_km": 100, "native_reference_tolerance_s": .1, "two_station_alternative_separation_km_minimum": 100, "two_station_rms_s_maximum": .1},
        "limitations": case["challenge"]["limitations"],
        "catalog_comparison_note": "The catalog may itself use these same archived observations. Agreement with its location is a descriptive comparison, not an independent validation of location accuracy.",
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"status": report["status"], "best_fit": {key: best[key] for key in ["latitude_deg", "longitude_deg", "origin_offset_s", "rms_s", "catalog_offset_km"]}, "max_native_reference_error_s": native_error, "leave_one_out_max_shift_km": max(x["full_fit_offset_km"] for x in dropouts), "two_station_separation_km": pair_separation}, indent=2))
    if not verdict:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
