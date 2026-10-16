# Sources, licenses, and attribution

Earthquake Lab's application code declares `LGPL-3.0-only`. [LICENSE](LICENSE) contains the complete LGPL version 3 text. [The retained upstream license](licenses/obspy-LICENSE.txt) supplies both complete GPL version 3 and LGPL version 3 texts unchanged. [NOTICE](NOTICE) records the limited Rust adaptation and original upstream attribution. The code license does not replace data or imagery policies.

Source-only documentation and manifests below open the repository. They are not included in a standalone compiled distribution. The repository is private during preview. Use the matching source revision and instructions in [SOURCE.md](SOURCE.md) for a distributed version.

## Numerical sources

The direct numerical source is [ObsPy 1.5.1 TauP](https://github.com/obspy/obspy/tree/1.5.1/obspy/taup). Its [package header](https://raw.githubusercontent.com/obspy/obspy/1.5.1/obspy/taup/__init__.py) names The ObsPy Development Team and GNU LGPL version 3. Its [license file](https://raw.githubusercontent.com/obspy/obspy/1.5.1/obspy/LICENSE.txt) supplies the full GPL and additional LGPL permissions. The original combined license is retained unchanged in [licenses/obspy-LICENSE.txt](licenses/obspy-LICENSE.txt). The root license is its complete verbatim LGPL version 3 section.

The upstream [TauP README](https://raw.githubusercontent.com/obspy/obspy/1.5.1/obspy/taup/README.txt) attributes copyright to The ObsPy Dev Team for 2011-2015. Its copyright section also contains the literal label `GLPv3`. That label differs from the explicit LGPL version 3 package header. This project preserves its existing LGPL declaration and records the discrepancy rather than claiming that every upstream statement agrees. The exact README and source hashes are retained in [licenses/obspy-taup-README.txt](licenses/obspy-taup-README.txt) and [licenses/obspy-taup-provenance.json](licenses/obspy-taup-provenance.json).

ObsPy's TauP descends from the Java TauP Toolkit by H. P. Crotwell, T. J. Owens, and J. Ritsema. The Java research reference is pinned to revision `d2cde943f6954792298cdff105e87486945aefe4` in [the numerical provenance](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/fixtures/provenance.json). Its [root license](https://github.com/crotwell/TauP/blob/d2cde943f6954792298cdff105e87486945aefe4/LICENSE) declares LGPL version 3. Some numerical source headers retain GPL version 2 or later and University of South Carolina copyright, including [SlownessLayer.java](https://github.com/crotwell/TauP/blob/d2cde943f6954792298cdff105e87486945aefe4/src/main/java/edu/sc/seis/TauP/SlownessLayer.java). Java is a research reference. No Java source is redistributed here. The project records ObsPy as the direct source of the limited Rust adaptation.

The [numerical contract](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/docs/numerical-contract.md) defines the supported subset and known enumeration limits. Agreement with related TauP implementations checks the implementation. It does not independently establish physical accuracy for an observed earthquake.

## IASP91 model

The sampled IASP91 layers come from pinned ObsPy preprocessing. [fixtures/provenance.json](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/fixtures/provenance.json) retains the upstream revision, velocity-model hash, sampled-model hash, and reference hashes. [scripts/capture_reference.py](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/scripts/capture_reference.py) records the generation recipe. These are radial slowness inputs for local calculations, not a table of arrival answers.

The scientific citation is Kennett, B. L. N., and Engdahl, E. R. 1991. Traveltimes for global earthquake location and phase identification. Geophysical Journal International 105, 429-465. [doi:10.1111/j.1365-246X.1991.tb06724.x](https://doi.org/10.1111/j.1365-246X.1991.tb06724.x). This project does not assign a new license to the underlying model constants.

## Earthquake observations

The app retains 21 actual vertical recordings across Tohoku 2011, Maule 2010, and Okhotsk 2013. Only Tohoku has the qualified source-location exercise. [Data provenance](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/docs/data-provenance.md), [earthquake cases](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/docs/earthquake-cases.md), and [the location method](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/docs/location-experiment.md) describe processing, clocks, matching, and missing uncertainty. Each pack retains its acquisition manifest and source hashes.

Credit Albuquerque Seismological Laboratory/USGS, Global Seismograph Network, [doi:10.7914/SN/IU](https://doi.org/10.7914/SN/IU). EarthScope's IRIS Data Management Center supplied the recordings and station metadata. The identified USGS producer and [USGS public-domain statement](https://www.usgs.gov/faqs/are-usgs-reportspublications-copyrighted) provide the documented reuse basis for these IU observations. An empty DOI rights list does not grant a Creative Commons license. Public access alone is not a redistribution basis.

Data access used EarthScope Consortium's NSF National Geophysical Facility archive, supported by NSF award 2435260. [EarthScope's citation guidance](https://www.earthscope.org/how-to-cite/) identifies this archive acknowledgement. This credits the data service and does not claim funding for Earthquake Lab.

The publication candidate distributes only the event facts and 16 selected factual manual P picks used by the app. It excludes full multi-agency event responses, QuakeML aggregates, unused tensors, origins, amplitudes and embedded prose from its tree and Git history. Original acquisition receipts and the extraction recipe preserve provenance. The selected picks have no separate creator or rights field. Creator, channel, location and uncertainty remain unknown.

The [Copyright Office factual-data guidance](https://www.copyright.gov/help/faq/faq-protect.html) and [USGS data-licensing guidance](https://www.usgs.gov/data-management/data-licensing) support this limited factual distribution. They do not confer blanket rights to the original compilation or certify every jurisdiction. The [publication-data record](docs/publication-data.md) defines the excluded archive scope, reproducibility and clean-history gate. The original development repository and complete captures stay private and preserved.

## Cartography and Earth imagery

Natural Earth provides the geographic polygons under its [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/). [Cartography provenance](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/fixtures/cartography/provenance.json) identifies the downloaded 1:110 million land GeoJSON and rounded polygon derivative. The polygons supply geographic context and do not change ray calculations.

The globe uses NASA Earth Observatory's Blue Marble Next Generation July 2004 composite. Reto Stöckli produced the dataset at NASA Goddard Space Flight Center. [Earth imagery provenance](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/docs/earth-imagery.md) records the download, derivative, hashes, projection, and [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). Credit NASA Earth Observatory. The image supplies geographic context and does not represent earthquake-time weather. No NASA endorsement is implied. Its media policies are separate from the application code license.

## JavaScript and Rust dependencies

Three.js 0.186.1 is used under MIT. Its full notice is retained in [licenses/three.txt](licenses/three.txt). [package-lock.json](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/package-lock.json) locks the JavaScript dependency versions. Development dependencies have their own licenses and are not all MIT. The source repository does not vendor their installations or browser binaries.

[Cargo.lock](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/Cargo.lock) locks the Rust dependency versions. [licenses/rust/manifest.json](licenses/rust/manifest.json) maps every locked external crate to its declared SPDX expression, package checksum, source, and retained license texts. Both MIT and Apache texts are retained for dual-licensed crates. `memchr` also retains its Unlicense text. `unicode-ident` additionally retains Unicode-3.0. Including build-time dependencies in that inventory does not claim that all of their code appears in the runtime.

The Python reference environment is pinned by [requirements-reference.txt](https://github.com/steph4n-gh/earthquake-lab-publication/blob/main/requirements-reference.txt). ObsPy and the scientific packages generate or verify fixtures. Python does not run in the browser. Their environments and caches are not redistributed.

## Separate compiled distributions

A static build or native binary needs its notices and a corresponding-source route for that version. The source tree contains the Rust core, browser source, model inputs, lockfiles, and rebuild scripts. A distributor must identify the exact source commit and preserve access appropriate to the applicable licenses. The presence of a repository URL alone does not qualify an unrelated binary.

The intended notice bundle contains `LICENSE`, `NOTICE`, this document, and the complete `licenses/` directory. The build documentation describes how the current project packages that bundle. This inventory records source declarations and attribution. It is not a legal opinion about every possible downstream distribution.
