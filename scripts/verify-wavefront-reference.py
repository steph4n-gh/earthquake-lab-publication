#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np
import obspy
from obspy.taup import TauPyModel
from obspy.taup.seismic_phase import SeismicPhase

from verify_numerics import LIMITS, interpolate

ROOT = Path(__file__).resolve().parents[1]
PATH_DEPTH_LIMIT_KM = 2.0
ENDPOINT_ANGLE_LIMIT_DEG = 1e-5
INTERNAL_CLOSURE_LIMIT = 1e-5
P_EPSILON = 1e-8
FROZEN_LIMITS = {"time_s": 0.1, "ray_param_s_rad": 0.05, "turning_depth_km": 0.5}
PHASES = ("P", "S", "PKIKP")
FIELDS = ("time_s", "distance_rad", "depth_km")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def phase_gaps(model, phase):
    layers = model.s_mod.s_layers if phase.name == "S" else model.s_mod.p_layers
    by_depth = {}
    for layer in layers:
        if layer["top_depth"] != layer["bot_depth"] or layer["bot_p"] >= layer["top_p"]:
            continue
        depth = float(layer["top_depth"])
        low, high = by_depth.get(depth, (math.inf, -math.inf))
        by_depth[depth] = (min(low, float(layer["bot_p"])), max(high, float(layer["top_p"])))
    return [
        {"phase": phase.name, "depth_km": depth, "lower_p_s_rad": low, "upper_p_s_rad": high}
        for depth, (low, high) in sorted(by_depth.items())
        if min(high, phase.max_ray_param) - max(low, phase.min_ray_param) > P_EPSILON
    ]


def case_segments(case):
    if "segments" in case:
        return case["segments"]
    by_identity = {}
    for ray in case.get("rays", []):
        identity = (ray["phase"], ray.get("segment_id", 0))
        by_identity.setdefault(identity, []).append(ray)
    return [{"phase": phase, "rays": rays} for (phase, _), rays in by_identity.items()]


def path_failures(ray, source_depth, label):
    errors = []
    path = ray.get("path", [])
    if len(path) < 2:
        return [f"{label}: fewer than two path points"]
    if not all(all(math.isfinite(point[field]) for field in FIELDS) for point in path):
        return [f"{label}: nonfinite path coordinate"]
    if not all(math.isfinite(ray[field]) for field in LIMITS):
        return [f"{label}: nonfinite ray summary"]
    first, last = path[0], path[-1]
    if abs(first["time_s"]) > 1e-8 or abs(first["distance_rad"]) > 1e-8:
        errors.append(f"{label}: source does not start at zero time and angle")
    if abs(first["depth_km"] - source_depth) > 1e-6:
        errors.append(f"{label}: wrong source depth")
    if abs(last["depth_km"]) > 1e-6:
        errors.append(f"{label}: receiver does not lie at surface")
    if abs(last["time_s"] - ray["time_s"]) > INTERNAL_CLOSURE_LIMIT:
        errors.append(f"{label}: endpoint time does not match summary")
    if abs(max(point["depth_km"] for point in path) - ray["turning_depth_km"]) > 1e-6:
        errors.append(f"{label}: maximum path depth does not match summary")
    if ray["time_s"] <= 0 or ray["turning_depth_km"] < source_depth - 1e-7:
        errors.append(f"{label}: invalid downgoing source-to-surface ray")
    for left, right in zip(path, path[1:]):
        if right["time_s"] < left["time_s"] - 1e-8 or right["distance_rad"] < left["distance_rad"] - 1e-8:
            errors.append(f"{label}: cumulative time or distance backtracks")
            break
    return errors


def direct_reference(phase, p):
    shot = phase.shoot_ray(0, p)
    phase.calc_path_from_arrival(shot)
    return shot


def check_reference_case(case, model, failures, maxima, oracle):
    depth = float(case["depth_km"])
    corrected = model.model.depth_correct(depth)
    phases = {name: SeismicPhase(name, corrected) for name in PHASES}
    gaps = {name: phase_gaps(corrected, phase) for name, phase in phases.items()}
    segments = case_segments(case)
    receipt = {"depth_km": depth, "rays": 0, "segments": len(segments), "phases": {}, "independent_gaps": gaps}
    native_gaps = case.get("gaps", [])
    seen_phases = set()
    for segment_index, segment in enumerate(segments):
        name = segment["phase"]
        if name not in phases:
            failures.append(f"depth={depth}: unsupported phase {name}")
            continue
        phase = phases[name]
        seen_phases.add(name)
        rays = segment["rays"]
        if not rays:
            failures.append(f"depth={depth} phase={name}: empty segment")
            continue
        parameters = [float(ray["ray_param_s_rad"]) for ray in rays]
        if any(right <= left for left, right in zip(parameters, parameters[1:])):
            failures.append(f"depth={depth} phase={name}: segment is not strictly ordered by increasing p")
        for left, right in zip(parameters, parameters[1:]):
            for gap in gaps[name]:
                if left < gap["upper_p_s_rad"] - P_EPSILON and right > gap["lower_p_s_rad"] + P_EPSILON:
                    failures.append(f"depth={depth} phase={name}: segment {segment_index} bridges jump at {gap['depth_km']}km")
        for ray in rays:
            p = float(ray["ray_param_s_rad"])
            label = f"depth={depth} phase={name} p={p:.12g}"
            receipt["rays"] += 1
            receipt["phases"][name] = receipt["phases"].get(name, 0) + 1
            if ray["phase"] != name:
                failures.append(f"{label}: ray phase differs from segment")
            local = path_failures(ray, depth, label)
            failures.extend(local)
            if local:
                continue
            if p < phase.min_ray_param - P_EPSILON or p > phase.max_ray_param + P_EPSILON:
                failures.append(f"{label}: p outside independent phase bounds")
                continue
            for gap in gaps[name]:
                if gap["lower_p_s_rad"] + P_EPSILON < p < gap["upper_p_s_rad"] - P_EPSILON:
                    failures.append(f"{label}: ray turns inside velocity-jump gap at {gap['depth_km']}km")
            turn = ray["turning_depth_km"]
            if name == "PKIKP" and turn < corrected.iocb_depth - 1e-7:
                failures.append(f"{label}: PKIKP does not enter inner core")
            if name != "PKIKP" and turn > corrected.cmb_depth + 1e-7:
                failures.append(f"{label}: mantle phase crosses the CMB")
            try:
                shot = direct_reference(phase, p)
            except Exception as error:
                failures.append(f"{label}: direct reference shot failed with {error}")
                continue
            path = ray["path"]
            reference_path = [{"time_s": float(point["time"]), "distance_rad": float(point["dist"]),
                               "depth_km": float(point["depth"])} for point in shot.path]
            errors = {
                "time_s": abs(ray["time_s"] - float(shot.time)),
                "ray_param_s_rad": abs(p - float(shot.ray_param)),
                "turning_depth_km": abs(turn - float(max(shot.path["depth"]))),
                "endpoint_distance_deg": abs(math.degrees(path[-1]["distance_rad"] - float(shot.purist_dist))),
            }
            for field, limit in {**LIMITS, "endpoint_distance_deg": ENDPOINT_ANGLE_LIMIT_DEG}.items():
                maxima[field] = max(maxima[field], errors[field])
                if errors[field] > limit:
                    failures.append(f"{label}: {field} error {errors[field]:.12g} exceeds {limit}")
            quantile_errors = []
            for fraction in np.linspace(0, 1, 21):
                actual_time = float(fraction) * ray["time_s"]
                reference_time = float(fraction) * float(shot.time)
                actual_depth = interpolate(path, actual_time, "depth_km")
                reference_depth = float(np.interp(reference_time, shot.path["time"], shot.path["depth"]))
                error = abs(actual_depth - reference_depth)
                quantile_errors.append(error)
            sample_errors = []
            for point in path:
                reference_time = point["time_s"] / ray["time_s"] * float(shot.time)
                reference_depth = float(np.interp(reference_time, shot.path["time"], shot.path["depth"]))
                sample_errors.append(abs(point["depth_km"] - reference_depth))
            errors["path_depth_km"] = max(quantile_errors)
            errors["all_sample_depth_km"] = max(sample_errors)
            for field in ("path_depth_km", "all_sample_depth_km"):
                maxima[field] = max(maxima[field], errors[field])
                if errors[field] > PATH_DEPTH_LIMIT_KM:
                    failures.append(f"{label}: {field} error {errors[field]:.12g} exceeds {PATH_DEPTH_LIMIT_KM}")
            oracle.append({"depth_km": depth, "phase": name, "segment_index": segment_index,
                           "ray_param_s_rad": p, "time_s": float(shot.time),
                           "endpoint_distance_deg": math.degrees(float(shot.purist_dist)),
                           "turning_depth_km": float(max(shot.path["depth"])),
                           "errors": errors, "quantile_depth_errors_km": quantile_errors,
                           "all_sample_depth_errors_km": sample_errors, "path": reference_path})
    for name in PHASES:
        if name not in seen_phases:
            failures.append(f"depth={depth}: no {name} rays checked")
        for gap in gaps[name]:
            low = max(gap["lower_p_s_rad"], phases[name].min_ray_param)
            high = min(gap["upper_p_s_rad"], phases[name].max_ray_param)
            if not any(got.get("phase") == name and abs(got.get("depth_km", math.inf) - gap["depth_km"]) < 1e-6
                       and got["lower_p_s_rad"] <= low + P_EPSILON and got["upper_p_s_rad"] >= high - P_EPSILON
                       for got in native_gaps):
                failures.append(f"depth={depth} phase={name}: missing explicit jump gap at {gap['depth_km']}km")
    return receipt


def analytic_case(case, failures, maxima):
    radius = float(case["radius_km"])
    velocity = float(case["velocity_km_s"])
    depth = float(case["depth_km"])
    source_radius = radius - depth
    rays = case.get("rays", []) or [ray for segment in case_segments(case) for ray in segment["rays"]]
    receipt = {"radius_km": radius, "velocity_km_s": velocity, "depth_km": depth, "rays": len(rays),
               "path_samples": 0, "time_quantiles": 0, "maximum_errors": {}}
    local_maxima = {"time_s": 0.0, "turning_depth_km": 0.0, "endpoint_distance_deg": 0.0,
                    "sample_depth_km": 0.0, "sample_distance_deg": 0.0, "sample_isochron_radius_km": 0.0,
                    "quantile_depth_km": 0.0}
    if not rays:
        failures.append(f"constant sphere depth={depth}: missing rays")
    for ray in rays:
        p = float(ray["ray_param_s_rad"])
        label = f"constant sphere depth={depth} p={p}"
        local = path_failures(ray, depth, label)
        failures.extend(local)
        if local:
            continue
        impact = p * velocity
        if not 0 <= impact <= source_radius:
            failures.append(f"{label}: invalid impact radius")
            continue
        sine = impact / source_radius
        cosine = math.sqrt(max(0, 1 - sine * sine))
        length = source_radius * cosine + math.sqrt(radius * radius - impact * impact)
        expected_time = length / velocity
        expected_turn = radius - impact
        expected_angle = math.atan2(length * sine, source_radius - length * cosine)
        local_maxima["time_s"] = max(local_maxima["time_s"], abs(ray["time_s"] - expected_time))
        local_maxima["turning_depth_km"] = max(local_maxima["turning_depth_km"], abs(ray["turning_depth_km"] - expected_turn))
        local_maxima["endpoint_distance_deg"] = max(local_maxima["endpoint_distance_deg"], abs(math.degrees(ray["path"][-1]["distance_rad"] - expected_angle)))
        for point in ray["path"]:
            time = point["time_s"]
            x, z = velocity * time * sine, source_radius - velocity * time * cosine
            expected_depth = radius - math.hypot(x, z)
            expected_distance = math.atan2(x, z)
            actual_radius = radius - point["depth_km"]
            actual_x = actual_radius * math.sin(point["distance_rad"])
            actual_z = actual_radius * math.cos(point["distance_rad"])
            local_maxima["sample_depth_km"] = max(local_maxima["sample_depth_km"], abs(point["depth_km"] - expected_depth))
            if math.hypot(x, z) > 1e-6:
                local_maxima["sample_distance_deg"] = max(local_maxima["sample_distance_deg"], abs(math.degrees(point["distance_rad"] - expected_distance)))
            local_maxima["sample_isochron_radius_km"] = max(local_maxima["sample_isochron_radius_km"], abs(math.hypot(actual_x, actual_z - source_radius) - velocity * time))
            receipt["path_samples"] += 1
        for fraction in np.linspace(0, 1, 21):
            time = float(fraction) * expected_time
            x, z = velocity * time * sine, source_radius - velocity * time * cosine
            expected_depth = radius - math.hypot(x, z)
            actual_depth = interpolate(ray["path"], float(fraction) * ray["time_s"], "depth_km")
            local_maxima["quantile_depth_km"] = max(local_maxima["quantile_depth_km"], abs(actual_depth - expected_depth))
            receipt["time_quantiles"] += 1
    limits = {"time_s": LIMITS["time_s"], "turning_depth_km": LIMITS["turning_depth_km"],
              "endpoint_distance_deg": ENDPOINT_ANGLE_LIMIT_DEG, "sample_depth_km": 1e-6,
              "sample_distance_deg": ENDPOINT_ANGLE_LIMIT_DEG, "sample_isochron_radius_km": 1e-6,
              "quantile_depth_km": PATH_DEPTH_LIMIT_KM}
    for field, error in local_maxima.items():
        if error > limits[field]:
            failures.append(f"constant sphere depth={depth}: {field} error {error:.12g} exceeds {limits[field]}")
    receipt["maximum_errors"] = local_maxima
    for field, value in local_maxima.items():
        maxima["analytic_" + field] = max(maxima.get("analytic_" + field, 0), value)
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=".audit/wavefronts/reference/fan.json")
    parser.add_argument("--output", default=".audit/wavefronts/reference/report.json")
    args = parser.parse_args()
    input_path = ROOT / args.input
    output_path = ROOT / args.output
    fixture = json.loads(input_path.read_text())
    failures = []
    if LIMITS != FROZEN_LIMITS:
        failures.append("Existing numerical limits differ from the frozen baseline")
    if obspy.__version__ != "1.5.1":
        failures.append(f"ObsPy version {obspy.__version__} differs from frozen 1.5.1")
    model = TauPyModel("iasp91")
    maxima = {**{field: 0.0 for field in LIMITS}, "endpoint_distance_deg": 0.0,
              "path_depth_km": 0.0, "all_sample_depth_km": 0.0}
    oracle = []
    receipts = [check_reference_case(case, model, failures, maxima, oracle) for case in fixture.get("cases", [])]
    if not receipts:
        failures.append("No independently checked IASP91 fan cases")
    controls = [analytic_case(case, failures, maxima) for case in fixture.get("constant_velocity_controls", [])]
    if not controls:
        failures.append("No actual-engine constant-velocity spherical controls")
    if not any(case["depth_km"] > 500 for case in receipts):
        failures.append("No deep-source fan case above 500km")
    if not any(case["depth_km"] == 0 for case in receipts):
        failures.append("No surface-source fan case")
    if not any(case["depth_km"] > 0 for case in controls):
        failures.append("No buried-source constant-velocity spherical control")
    oracle_path = output_path.with_name(output_path.stem + "-oracle.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    oracle_path.write_text(json.dumps(oracle, separators=(",", ":")) + "\n")
    package = Path(obspy.__file__).parent
    report = {
        "verdict": "PASS" if not failures else "FAIL",
        "claim": "Each exported sampled ray is checked by an arbitrary-p ObsPy shot. Constant-velocity controls check actual-engine ray samples against analytic source-centered spherical isochrons. This is not a full wavefield or a completeness proof.",
        "input": str(input_path.relative_to(ROOT)), "input_sha256": sha256(input_path),
        "helper_sha256": sha256(Path(__file__)), "model_sha256": sha256(ROOT / "fixtures/iasp91.json"),
        "rust_source_sha256": sha256(ROOT / "crates/taup-core/src/lib.rs"),
        "native_binary_sha256": sha256(ROOT / "target/release/taup"),
        "numerical_contract_sha256": sha256(ROOT / "docs/numerical-contract.md"),
        "versions": {"obspy": obspy.__version__, "numpy": np.__version__},
        "reference_velocity_sha256": sha256(package / "taup/data/iasp91.tvel"),
        "oracle_api": "SeismicPhase(name, depth_corrected_model).shoot_ray(0, p); calc_path_from_arrival(shot)",
        "oracle_source_sha256": sha256(package / "taup/seismic_phase.py"),
        "limits": {**LIMITS, "path_depth_km": PATH_DEPTH_LIMIT_KM, "all_sample_depth_km": PATH_DEPTH_LIMIT_KM,
                   "endpoint_distance_deg": ENDPOINT_ANGLE_LIMIT_DEG},
        "maximum_errors": maxima, "cases": receipts, "rays_checked": sum(case["rays"] for case in receipts),
        "oracle_rays_checked": len(oracle), "time_quantiles_per_ray": 21, "constant_velocity_controls": controls,
        "oracle_path": str(oracle_path.relative_to(ROOT)), "oracle_sha256": sha256(oracle_path),
        "failure_count": len(failures), "failures": failures,
    }
    output_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key not in ("cases", "failures")}, indent=2))
    if failures:
        print("\n".join(failures[:50]), file=sys.stderr)
    return bool(failures)


if __name__ == "__main__":
    sys.exit(main())
