#!/usr/bin/env python3
"""Spot-check the pinned Java reference separately from the frozen ObsPy oracle."""
import json
import os
from pathlib import Path
import subprocess

from obspy.taup import TauPyModel

ROOT = Path(__file__).resolve().parents[1]


def main():
    env = dict(os.environ)
    env["JAVA_HOME"] = str(next((ROOT / ".cache/java").glob("*/Contents/Home")))
    executable = ROOT / ".cache/TauP/build/install/TauP/bin/taup"
    model = TauPyModel("iasp91")
    cases = []
    for depth, distance in [(0, 20), (10, 30), (35, 60), (29, 82.9537792701), (100, 5), (29, 149.0291368208), (700, 179)]:
        run = subprocess.run([str(executable), "time", "--mod", "iasp91", "-h", str(depth), "--deg", str(distance), "-p", "P,S,PKIKP", "--json"], env=env, capture_output=True, text=True, check=True)
        java = json.loads(run.stdout)["arrivals"]
        python = model.get_ray_paths(depth, distance, phase_list=["P", "S", "PKIKP"], ray_param_tol=1e-8)
        assert len(java) == len(python), (depth, distance, len(java), len(python))
        differences = [abs(a["time"] - b.time) for a, b in zip(java, python)]
        assert all(d < 0.1 for d in differences), differences
        cases.append({"depth_km": depth, "distance_deg": distance, "java_arrivals": java, "maximum_time_difference_s": max(differences, default=0)})
    report = {"verdict": "VERIFIED", "java_revision": json.loads((ROOT / "fixtures/provenance.json").read_text())["java_taup_revision"], "note": "Related implementations; this is not independent Earth-model validation.", "cases": cases}
    (ROOT / ".audit/java-spot-check.json").write_text(json.dumps(report, indent=2) + "\n")
    print("Java source build and seven spot-check queries verified.")


if __name__ == "__main__":
    main()
