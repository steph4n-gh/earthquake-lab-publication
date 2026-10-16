#!/usr/bin/env python3
"""Capture pinned model inputs and oracle outputs before changing the solver."""
import hashlib
import argparse
import json
from pathlib import Path
import subprocess

import numpy as np
import obspy
from obspy.taup import TauPyModel

ROOT = Path(__file__).resolve().parents[1]
MODEL = TauPyModel("iasp91")
PHASES = ["P", "S", "PKIKP"]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--edges", action="store_true")
    parser.add_argument("--held-out", action="store_true")
    args = parser.parse_args()
    package = Path(obspy.__file__).parent
    velocity_path = package / "taup/data/iasp91.tvel"
    slowness = MODEL.model.s_mod
    model = {
        "name": "iasp91",
        "radius_km": float(MODEL.model.radius_of_planet),
        "cmb_depth_km": float(MODEL.model.cmb_depth),
        "icb_depth_km": float(MODEL.model.iocb_depth),
        "ray_params_s_rad": [float(p) for p in MODEL.model.ray_params],
        "source": {
            "obspy_version": obspy.__version__,
            "velocity_sha256": sha256(velocity_path),
            "description": "Sampled Bullen slowness layers, not precomputed ray answers.",
        },
    }
    for name, layers in [("p_layers", slowness.p_layers), ("s_layers", slowness.s_layers)]:
        model[name] = [[float(layer[key]) for key in ["top_p", "top_depth", "bot_p", "bot_depth"]] for layer in layers]
    (ROOT / "fixtures/iasp91.json").write_text(json.dumps(model, separators=(",", ":")) + "\n")
    depths = [0, 10, 29, 35, 100, 300, 600, 700]
    distances = [1, 5, 10, 18, 20, 22, 25, 30, 60, 90, 98, 100, 105, 110, 115, 120, 130, 145, 150, 160, 175, 179]
    if args.edges:
        depths = [edge + offset for edge in [20, 35, 410, 660] for offset in [-0.001, 0, 0.001]]
        distances = [1, 5, 20, 30, 98, 115, 150]
    pairs = [(depth, distance) for depth in depths for distance in distances]
    if args.held_out:
        rng = np.random.default_rng(20261015)
        pairs = [(float(rng.uniform(0, 700)), float(rng.uniform(1, 179))) for _ in range(128)]
        from obspy.taup.seismic_phase import SeismicPhase
        for depth in [0, 10, 29, 100, 400]:
            corrected = MODEL.model.depth_correct(depth)
            for name in PHASES:
                phase = SeismicPhase(name, corrected)
                angles = np.degrees(phase.dist)
                for i in range(1, len(angles) - 1):
                    if (angles[i] - angles[i - 1]) * (angles[i + 1] - angles[i]) < 0:
                        for offset in [-0.001, 0.001]:
                            angle = float(angles[i] + offset)
                            if 1 < angle < 179:
                                pairs.append((depth, angle))
    cases = []
    for depth, distance in pairs:
            arrivals = MODEL.get_ray_paths(depth, distance, phase_list=PHASES, ray_param_tol=1e-8)
            outputs = []
            for arrival in arrivals:
                path = arrival.path
                fractions = np.linspace(0, 1, 21)
                times = fractions * arrival.time
                outputs.append({
                    "phase": arrival.name,
                    "time_s": float(arrival.time),
                    "ray_param_s_rad": float(arrival.ray_param),
                    "turning_depth_km": float(max(path["depth"])),
                    "path_samples": [
                        {"time_s": float(t), "depth_km": float(z), "distance_rad": float(d)}
                        for t, z, d in zip(times, np.interp(times, path["time"], path["depth"]), np.interp(times, path["time"], path["dist"]))
                    ],
                })
            cases.append({"depth_km": depth, "distance_deg": distance, "arrivals": outputs})
    corpus = {
        "oracle": "ObsPy TauPyModel.get_ray_paths",
        "version": obspy.__version__,
        "ray_param_tol": 1e-8,
        "model_sha256": sha256(ROOT / "fixtures/iasp91.json"),
        "phases": PHASES,
        "cases": cases,
    }
    output_name = "reference-held-out.json" if args.held_out else "reference-boundaries.json" if args.edges else "reference.json"
    (ROOT / "fixtures" / output_name).write_text(json.dumps(corpus, separators=(",", ":")) + "\n")
    if args.edges or args.held_out:
        print(json.dumps({"output": output_name, "cases": len(cases), "arrivals": sum(len(c["arrivals"]) for c in cases), "sha256": sha256(ROOT / "fixtures" / output_name)}))
        return
    revision = subprocess.check_output(["git", "-C", str(ROOT / ".cache/TauP"), "rev-parse", "HEAD"], text=True).strip()
    provenance = {
        "java_taup_revision": revision,
        "obspy_version": obspy.__version__,
        "numpy_version": np.__version__,
        "model_sha256": sha256(ROOT / "fixtures/iasp91.json"),
        "reference_sha256": sha256(ROOT / "fixtures/reference.json"),
        "velocity_sha256": sha256(velocity_path),
        "case_count": len(cases),
        "arrival_count": sum(len(case["arrivals"]) for case in cases),
        "upstream_url": "https://github.com/crotwell/TauP/tree/" + revision,
        "obspy_url": "https://github.com/obspy/obspy/tree/" + obspy.__version__,
    }
    (ROOT / "fixtures/provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    main()
