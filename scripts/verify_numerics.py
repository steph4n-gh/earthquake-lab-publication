#!/usr/bin/env python3
"""Compare the native consumer API with the frozen numerical oracle."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
LIMITS = {"time_s": 0.1, "ray_param_s_rad": 0.05, "turning_depth_km": 0.5}


def interpolate(points, time, field):
    for left, right in zip(points, points[1:]):
        if right["time_s"] >= time:
            span = right["time_s"] - left["time_s"]
            fraction = (time - left["time_s"]) / span if span else 0
            return left[field] + fraction * (right[field] - left[field])
    return points[-1][field]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", default="fixtures/reference.json")
    args = parser.parse_args()
    corpus_path = ROOT / args.corpus
    corpus = json.loads(corpus_path.read_text())
    queries = [{"depth_km": c["depth_km"], "distance_deg": c["distance_deg"]} for c in corpus["cases"]]
    run = subprocess.run([str(ROOT / "target/release/taup"), "--batch"], input=json.dumps(queries), text=True, capture_output=True, check=True)
    actual = json.loads(run.stdout)
    assert len(actual) == len(queries), "Batch must return one result per query"
    errors = []
    maxima = {key: 0.0 for key in LIMITS}
    maxima.update(path_depth_km=0.0, endpoint_distance_deg=0.0)
    for index, (case, arrivals) in enumerate(zip(corpus["cases"], actual)):
        label = f"depth={case['depth_km']} distance={case['distance_deg']}"
        for phase in corpus["phases"]:
            expected = sorted((a for a in case["arrivals"] if a["phase"] == phase), key=lambda a: a["ray_param_s_rad"])
            observed = sorted((a for a in arrivals if a["phase"] == phase), key=lambda a: a["ray_param_s_rad"])
            if len(expected) != len(observed):
                errors.append(f"{label} {phase}: count {len(observed)} != {len(expected)}")
                continue
            for want, got in zip(expected, observed):
                for field, tolerance in LIMITS.items():
                    error = abs(got[field] - want[field])
                    maxima[field] = max(maxima[field], error)
                    if error > tolerance:
                        errors.append(f"{label} {phase}: {field} error {error:.9g} > {tolerance}")
                path = got["path"]
                if len(path) < 2:
                    errors.append(f"{label} {phase}: missing path")
                    continue
                if abs(path[0]["depth_km"] - case["depth_km"]) > 1e-6 or abs(path[-1]["depth_km"]) > 1e-6:
                    errors.append(f"{label} {phase}: path source/receiver depth does not close")
                closure = abs(path[-1]["distance_rad"] * 180 / 3.141592653589793 - case["distance_deg"])
                maxima["endpoint_distance_deg"] = max(maxima["endpoint_distance_deg"], closure)
                if closure > 1e-5 or abs(path[-1]["time_s"] - got["time_s"]) > 1e-5:
                    errors.append(f"{label} {phase}: path endpoint does not close")
                for point in want["path_samples"]:
                    time = point["time_s"] / want["time_s"] * got["time_s"]
                    error = abs(interpolate(path, time, "depth_km") - point["depth_km"])
                    maxima["path_depth_km"] = max(maxima["path_depth_km"], error)
                    if error > 2.0:
                        errors.append(f"{label} {phase}: path depth error {error:.6f}km > 2.0")
                        break
    report = {"verdict": "VERIFIED" if not errors else "NOT VERIFIED", "corpus": args.corpus,
              "corpus_sha256": hashlib.sha256(corpus_path.read_bytes()).hexdigest(),
              "rust_source_sha256": hashlib.sha256((ROOT / "crates/taup-core/src/lib.rs").read_bytes()).hexdigest(),
              "native_binary_sha256": hashlib.sha256((ROOT / "target/release/taup").read_bytes()).hexdigest(),
              "cases": len(queries), "reference_arrivals": sum(len(c["arrivals"]) for c in corpus["cases"]),
              "limits": LIMITS, "maximum_errors": maxima, "failure_count": len(errors), "failures": errors}
    report_path = ROOT / ".audit" / ("numerics.json" if corpus_path.name == "reference.json" else "numerics-" + corpus_path.stem + ".json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "failures"}, indent=2))
    if errors:
        print("\n".join(errors[:35]), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
