#!/usr/bin/env python3
import copy
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import numpy as np
from obspy.taup import TauPyModel
from obspy.taup.seismic_phase import SeismicPhase

root = Path(__file__).resolve().parents[1]
helper = root / "scripts/verify-wavefront-reference.py"
sys.path.insert(0, str(root / "scripts"))
spec = importlib.util.spec_from_file_location("wavefront_reference", helper)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
model = TauPyModel("iasp91")
maxima_keys = [*module.LIMITS, "endpoint_distance_deg", "path_depth_km", "all_sample_depth_km"]

def check(case):
    errors = []
    maxima = dict.fromkeys(maxima_keys, 0.0)
    oracle = []
    module.check_reference_case(case, model, errors, maxima, oracle)
    return errors, maxima

cases = []
for depth in [0.0, 598.1]:
    corrected = model.model.depth_correct(depth)
    case = {"depth_km": depth, "segments": [], "gaps": []}
    for name in module.PHASES:
        phase = SeismicPhase(name, corrected)
        gaps = module.phase_gaps(corrected, phase)
        case["gaps"].extend(gaps)
        edges = [float(phase.min_ray_param)]
        for gap in sorted(gaps, key=lambda gap: gap["lower_p_s_rad"]):
            edges.extend([max(float(phase.min_ray_param), gap["lower_p_s_rad"]),
                          min(float(phase.max_ray_param), gap["upper_p_s_rad"])])
        edges.append(float(phase.max_ray_param))
        for low, high in zip(edges[::2], edges[1::2]):
            if high <= low:
                continue
            rays = []
            for fraction in [0.2, 0.8]:
                p = low + fraction * (high - low)
                shot = module.direct_reference(phase, p)
                rays.append({"phase": name, "ray_param_s_rad": p, "time_s": float(shot.time),
                             "turning_depth_km": float(max(shot.path["depth"])),
                             "path": [{"time_s": float(point["time"]), "distance_rad": float(point["dist"]),
                                       "depth_km": float(point["depth"])} for point in shot.path]})
            case["segments"].append({"phase": name, "rays": rays})
    cases.append(case)

results = []
for case in cases:
    errors, maxima = check(case)
    assert not errors, errors
    results.append({"name": "self-reference positive", "depth_km": case["depth_km"], "failures": errors, "maximum_errors": maxima})

for name, change in [
    ("arrival time corruption", lambda case: case["segments"][0]["rays"][0].__setitem__("time_s", case["segments"][0]["rays"][0]["time_s"] + 1)),
    ("nonfinite path coordinate", lambda case: case["segments"][0]["rays"][0]["path"][1].__setitem__("depth_km", math.nan)),
    ("missing discontinuity metadata", lambda case: case.__setitem__("gaps", [])),
]:
    changed = copy.deepcopy(cases[0])
    change(changed)
    errors, _ = check(changed)
    assert errors, name
    results.append({"name": name, "rejected": True, "failure_count": len(errors), "example": errors[0]})

changed = copy.deepcopy(cases[0])
changed["segments"] = [{"phase": name, "rays": sorted([ray for segment in changed["segments"] if segment["phase"] == name for ray in segment["rays"]], key=lambda ray: ray["ray_param_s_rad"])} for name in module.PHASES]
errors, _ = check(changed)
assert any("bridges jump" in error for error in errors), errors
results.append({"name": "cross-discontinuity segment", "rejected": True, "failure_count": len(errors), "example": errors[0]})

for depth in [0.0, 100.0]:
    radius, velocity = 6371.0, 6.0
    rs = radius - depth
    control = {"radius_km": radius, "velocity_km_s": velocity, "depth_km": depth, "rays": []}
    for sine in [0.0, 0.1, 0.5, 0.9]:
        cosine = math.sqrt(1 - sine * sine)
        impact = rs * sine
        length = rs * cosine + math.sqrt(radius * radius - impact * impact)
        total_time = length / velocity
        times = sorted(set([*np.linspace(0, total_time, 1001), rs * cosine / velocity]))
        path = []
        for time in times:
            x, z = velocity * time * sine, rs - velocity * time * cosine
            path.append({"time_s": float(time), "distance_rad": math.atan2(x, z), "depth_km": radius - math.hypot(x, z)})
        control["rays"].append({"phase": "P", "ray_param_s_rad": impact / velocity, "time_s": total_time,
                                "turning_depth_km": radius - impact, "path": path})
    errors, maxima = [], {}
    result = module.analytic_case(control, errors, maxima)
    assert not errors, errors
    results.append({"name": "analytic fixture positive", "depth_km": depth, "test_fixture_only": True, **result})
    control["rays"][1]["path"][50]["depth_km"] += 0.001
    errors, maxima = [], {}
    module.analytic_case(control, errors, maxima)
    assert errors, "analytic coordinate corruption passed"
    results.append({"name": "analytic coordinate corruption", "depth_km": depth, "rejected": True, "failure_count": len(errors), "example": errors[0]})

report = {"verdict": "PASS", "claim": "This validates checker sensitivity using synthetic and self-reference fixtures. It does not validate Rust fan output.",
          "helper_sha256": hashlib.sha256(helper.read_bytes()).hexdigest(), "checks": results}
report_path = root / ".audit/wavefronts/reference/checker-controls.json"
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"verdict": report["verdict"], "checks": len(results)}, indent=2))
