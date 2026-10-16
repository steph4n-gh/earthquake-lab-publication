# Numerical contract

The first implementation supports the sampled IASP91 model, surface receivers, source depths from 0 through 700 km, angular distances from 1 through 179 degrees and the named phases P, S and PKIKP. Uppercase P and S launch downward. An empty supported-phase result does not mean that no seismic energy reaches the receiver.

Reference outputs were captured with ObsPy 1.5.1 `get_ray_paths`, explicitly setting ray-parameter refinement tolerance to 1e-8. Source, model and output hashes are recorded in fixtures/provenance.json. The 176-case corpus was captured before numerical implementation. It contains 427 arrivals, including multiple and absent arrivals. The corpus is not bundled into the browser engine.

Compare arrival counts exactly. Match arrivals within each phase by sorted ray parameter. Require absolute differences no larger than 0.1 seconds in travel time, 0.05 seconds per radian in ray parameter and 0.5 km in turning depth. Require endpoint angular closure within 1e-5 degrees. Compare displayed path depths at reference time quantiles within 2 km to accommodate discrete display interpolation, independently of travel-time accuracy. These are acceptance tolerances, not claims of agreement with the actual Earth. Do not widen them to hide failures.

The time tolerance is based on the upstream model's default 0.05-second interpolation-error target, not machine epsilon. Tight oracle refinement avoids the less precise default travel-time API. The ray, depth and path checks guard separate failure modes that time-only checks can miss. Report maximum observed errors, including failures.

Reference parity and physical model accuracy are distinct. Java TauP and ObsPy share implementation ancestry. An analytic constant-velocity sphere check supplies a separate mathematical control. Observed waveform traces are recordings, but modeled arrival lines are not manually identified observed picks. This model has no lateral Earth variation, amplitudes, attenuation, waveform synthesis or ground-motion prediction.

[TauP calculation documentation](https://taup.readthedocs.io/en/latest/calculations.html) and [ObsPy TauP documentation](https://docs.obspy.org/packages/obspy.taup.html) describe the related reference methods.

## Held-out enumeration diagnosis

The original exact-count requirement above remains enforced on the unchanged base and interface-boundary corpora. An additional 276-case held-out corpus exposed eight count differences. Rust returns 16 extra rays while matching every one of the 1,211 listed upstream arrivals. [The original failed count report](evidence/held-out-original.json) remains a curated historical snapshot. Repeating the strict comparison still fails; this project does not claim exact enumeration parity with ObsPy.

The acceptance amendment for these eight frozen groups is explicit. Match all original arrivals under the unchanged limits. Recover every additional ray independently by sampling 65 evenly spaced ray parameters within its containing upstream phase bracket and solving the upstream shooting function with SciPy Brent refinement. Candidate Rust ray parameters do not seed those roots. Require independent root agreement within 1e-6 seconds/radian and check upstream path, turning depth, time and endpoint closure under the original limits. Reject missing original arrivals or an unconfirmed extra ray. `scripts/reconcile_caustics.py` enforces this bounded rule and writes a fresh local receipt. [The retained reconciliation](evidence/held-out-reconciliation.json) preserves the historical grid and roots with its source identity.

The extra pairs occur inside sampled brackets whose endpoints are on the same side of the target angle. ObsPy's ordinary sampled enumeration misses them. A historical Java TauP 3.2.1 check also missed the extra pairs in three cases. That separate local diagnostic is not distributed as a public receipt. These implementations share ancestry. This is a diagnosis of their search sampling on the same model, not an independent seismic discovery or a proof of complete root enumeration.

Independent review also found a separate Rust duplicate at a microscopic distance offset from a caustic. The approximate tangent sample was emitted alongside two sign-crossing roots. The solver now suppresses that approximate sample when an adjacent bracket supplies a root. A public-API regression checks the two close rays remain distinct. This repair does not remove any of the 16 independently confirmed extra rays.

[The verification guide](verification.md) separates expected strict held-out failure from base and boundary acceptance, independent shooting reconciliation, and fresh qualification.
