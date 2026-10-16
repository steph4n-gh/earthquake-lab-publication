# Contribute to Earthquake Lab

Earthquake Lab is an educational preview. The core experience is a real recording, a bounded source-location exercise, and modeled travel through Earth.

Read the [development guide](docs/development.md) to build the app. Use the [verification guide](docs/verification.md) to choose checks for your change. The [documentation index](docs/README.md) separates the user tutorial from scientific and implementation references.

## Propose a change

Open an issue that describes a reproducible problem or a concrete learning goal. For a numerical change, include the phase, source depth, receiver distance, reference implementation and version, and expected result. An empty arrival set can be a valid answer.

Keep one independently reviewable change in each pull request. Include the affected public workflow, the checks you ran, and any remaining limitation. For a visible change, include a capture of the actual app.

## Preserve scientific meaning

- Keep observed picks, original recording times, model predictions, and fitted origin time distinct.
- Preserve missing uncertainty as missing. Do not invent confidence intervals.
- Keep numerical tolerances and known negative results visible. A new baseline needs an explanation and independent evidence.
- Retain exact branches and provenance when changing a plot.
- Describe ray-theory fronts as modeled travel time. Do not imply that they predict shaking amplitude or a complete wavefield.
- Obtain and record source terms before adding data or imagery. Code licensing does not establish data rights.

The current scope includes downward uppercase P, S, and PKIKP in a spherical IASP91 model. New phases and broader location methods require their own scientific references and verification.

## Submit a pull request

1. Create a branch from `main`.
2. Make the smallest change that solves the demonstrated problem.
3. Run the applicable checks in the verification guide.
4. Update the affected documentation and project verification skill if controls change.
5. Describe the result and its limits in the pull request.

Contributions to code use the project's LGPL-3.0-only license. Retain upstream copyright and license notices. Identify separately licensed data, media, and dependencies.
