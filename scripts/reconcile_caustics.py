#!/usr/bin/env python3
"""Diagnose frozen caustic count differences through independent upstream shooting."""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

import numpy as np
from obspy.taup import TauPyModel
from obspy.taup.seismic_phase import SeismicPhase
from scipy.optimize import brentq

from verify_numerics import LIMITS, interpolate

ROOT = Path(__file__).resolve().parents[1]
GRID_POINTS = 65
EXPECTED_EXTRA_ROOTS = 16
EXPECTED_DISCREPANCIES = 8


def main():
    corpus_path = ROOT / "fixtures/reference-held-out.json"
    corpus = json.loads(corpus_path.read_text())
    queries = [{"depth_km": c["depth_km"], "distance_deg": c["distance_deg"]} for c in corpus["cases"]]
    run = subprocess.run([str(ROOT / "target/release/taup"), "--batch"], input=json.dumps(queries), text=True, capture_output=True, check=True)
    actual = json.loads(run.stdout)
    failures = []
    if len(actual) != len(queries):
        failures.append("Native batch did not return one result per query")
    model = TauPyModel("iasp91")
    maxima = {field: 0.0 for field in LIMITS}
    maxima.update(path_depth_km=0.0, endpoint_distance_deg=0.0, dense_root_p_s_rad=0.0)
    receipts = []
    matched = 0
    mismatches = 0

    def check_arrival(want, got, label):
        for field, tolerance in LIMITS.items():
            error = abs(want[field] - got[field])
            maxima[field] = max(maxima[field], error)
            if not math.isfinite(got[field]) or error > tolerance:
                failures.append(f"{label}: {field} error {error} exceeds {tolerance}")
        path = got["path"]
        if len(path) < 2:
            failures.append(f"{label}: missing path")
            return
        if abs(path[0]["depth_km"] - case["depth_km"]) > 1e-6 or abs(path[-1]["depth_km"]) > 1e-6:
            failures.append(f"{label}: wrong source or receiver depth")
        if abs(path[0]["time_s"]) > 1e-8 or abs(path[0]["distance_rad"]) > 1e-8:
            failures.append(f"{label}: wrong source time or angle")
        closure = abs(math.degrees(path[-1]["distance_rad"]) - case["distance_deg"])
        maxima["endpoint_distance_deg"] = max(maxima["endpoint_distance_deg"], closure)
        if closure > 1e-5 or abs(path[-1]["time_s"] - got["time_s"]) > 1e-5:
            failures.append(f"{label}: path does not close")
        if abs(max(point["depth_km"] for point in path) - got["turning_depth_km"]) > 1e-6:
            failures.append(f"{label}: path turning depth differs from arrival")
        for left, right in zip(path, path[1:]):
            if any(not math.isfinite(right[field]) for field in ["time_s", "distance_rad", "depth_km"]):
                failures.append(f"{label}: nonfinite path")
                break
            if right["time_s"] < left["time_s"] or right["distance_rad"] < left["distance_rad"]:
                failures.append(f"{label}: path backtracks")
                break
        for point in want["path_samples"]:
            time = point["time_s"] / want["time_s"] * got["time_s"]
            error = abs(interpolate(path, time, "depth_km") - point["depth_km"])
            maxima["path_depth_km"] = max(maxima["path_depth_km"], error)
            if error > 2.0:
                failures.append(f"{label}: plotted path depth error {error} exceeds 2km")
                break

    for case, observed in zip(corpus["cases"], actual):
        for name in corpus["phases"]:
            label = f"depth={case['depth_km']} distance={case['distance_deg']} phase={name}"
            expected = sorted((a for a in case["arrivals"] if a["phase"] == name), key=lambda a: a["ray_param_s_rad"])
            remaining = sorted((a for a in observed if a["phase"] == name), key=lambda a: a["ray_param_s_rad"])
            if len(remaining) < len(expected):
                failures.append(f"{label}: native result misses original reference arrivals")
                continue
            for want in expected:
                if not remaining:
                    failures.append(f"{label}: no candidate for reference arrival")
                    break
                best = min(range(len(remaining)), key=lambda i: abs(remaining[i]["ray_param_s_rad"] - want["ray_param_s_rad"]))
                got = remaining.pop(best)
                check_arrival(want, got, label)
                matched += 1
            if not remaining:
                continue
            mismatches += 1
            phase = SeismicPhase(name, model.model.depth_correct(case["depth_km"]))
            brackets = {}
            for got in remaining:
                p = got["ray_param_s_rad"]
                indices = [i for i in range(len(phase.ray_param) - 1) if phase.ray_param[i] >= p >= phase.ray_param[i + 1]]
                if not indices:
                    failures.append(f"{label}: extra ray parameter is outside upstream phase")
                    continue
                brackets.setdefault(indices[0], []).append(got)
            for index, extras in brackets.items():
                low = float(phase.ray_param[index + 1])
                high = float(phase.ray_param[index])
                target = math.radians(case["distance_deg"])

                def residual(p):
                    return float(phase.shoot_ray(case["distance_deg"], p).purist_dist) - target

                grid = np.linspace(low, high, GRID_POINTS)
                values = [residual(float(p)) for p in grid]
                roots = []
                for left, right, fleft, fright in zip(grid, grid[1:], values, values[1:]):
                    if fleft == 0:
                        roots.append(float(left))
                    if fleft * fright < 0:
                        roots.append(float(brentq(residual, float(left), float(right), xtol=1e-11, rtol=1e-14)))
                if values[-1] == 0:
                    roots.append(float(high))
                roots = sorted(set(roots))
                bracket_receipt = {
                    "source_depth_km": case["depth_km"], "distance_deg": case["distance_deg"], "phase": name,
                    "sample_p_bounds_s_rad": [low, high],
                    "sample_distance_bounds_deg": [math.degrees(values[0] + target), math.degrees(values[-1] + target)],
                    "grid_points": GRID_POINTS, "grid_p_s_rad": [float(p) for p in grid],
                    "grid_distance_deg": [math.degrees(v + target) for v in values],
                    "independent_dense_roots_s_rad": roots, "extras": [],
                }
                for got in extras:
                    p = got["ray_param_s_rad"]
                    error = min((abs(p - root) for root in roots), default=math.inf)
                    maxima["dense_root_p_s_rad"] = max(maxima["dense_root_p_s_rad"], error)
                    if error > 1e-6:
                        failures.append(f"{label}: independent upstream grid did not recover p={p}")
                    shot = phase.shoot_ray(case["distance_deg"], p)
                    phase.calc_path_from_arrival(shot)
                    path = shot.path
                    times = np.linspace(0, 1, 21) * float(shot.time)
                    want = {"time_s": float(shot.time), "ray_param_s_rad": p,
                            "turning_depth_km": float(max(path["depth"])),
                            "path_samples": [{"time_s": float(time), "depth_km": float(depth)} for time, depth in zip(times, np.interp(times, path["time"], path["depth"]))]}
                    check_arrival(want, got, label + " extra")
                    direct_closure = abs(math.degrees(float(shot.purist_dist)) - case["distance_deg"])
                    if direct_closure > 1e-5:
                        failures.append(f"{label}: direct upstream extra ray does not close")
                    bracket_receipt["extras"].append({"rust_p_s_rad": p, "dense_root_p_error_s_rad": error,
                                                      "upstream_shoot_time_s": float(shot.time),
                                                      "upstream_shoot_distance_deg": math.degrees(float(shot.purist_dist)),
                                                      "upstream_turning_depth_km": float(max(path["depth"]))})
                receipts.append(bracket_receipt)
    expected_count = sum(len(case["arrivals"]) for case in corpus["cases"])
    extra_count = sum(len(receipt["extras"]) for receipt in receipts)
    if matched != expected_count:
        failures.append(f"Matched {matched} original arrivals instead of {expected_count}")
    if mismatches != EXPECTED_DISCREPANCIES or extra_count != EXPECTED_EXTRA_ROOTS:
        failures.append(f"Frozen discrepancy changed: {mismatches} groups and {extra_count} extras")
    report = {"verdict": "RECONCILED REFERENCE SEARCH LIMITATION" if not failures else "NOT RECONCILED",
              "claim": "The fixed 65-point upstream shooting grid recovers the additional Rust roots inside sampled upstream brackets. This does not alter the original exact-count failure report or validate physical observations.",
              "reference_sha256": hashlib.sha256(corpus_path.read_bytes()).hexdigest(),
              "rust_source_sha256": hashlib.sha256((ROOT / "crates/taup-core/src/lib.rs").read_bytes()).hexdigest(),
              "native_binary_sha256": hashlib.sha256((ROOT / "target/release/taup").read_bytes()).hexdigest(),
              "original_reference_arrivals": expected_count, "original_arrivals_matched": matched,
              "count_mismatch_groups": mismatches, "extra_rays_checked": extra_count, "grid_points_per_bracket": GRID_POINTS,
              "limits": LIMITS, "maximum_errors": maxima, "failure_count": len(failures), "failures": failures,
              "upstream_shooting_receipts": receipts}
    (ROOT / ".audit/caustic-validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "upstream_shooting_receipts"}, indent=2))
    return bool(failures)


if __name__ == "__main__":
    sys.exit(main())
