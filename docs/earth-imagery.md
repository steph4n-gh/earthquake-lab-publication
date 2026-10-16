# Earth surface imagery

The globe uses the July 2004 base map from [NASA's Blue Marble Next Generation collection](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/). The local surface texture is `fixtures/earth/blue-marble-2004-07-4096.jpg`. The application does not request imagery from an external service.

Blue Marble Next Generation uses monthly MODIS composites. The texture supplies geographic context. Its season, snow, vegetation, and remaining image artifacts describe the composite, not the date of a selected earthquake. It does not represent event-time weather, seismic observations, or the IASP91 velocity model. NASA describes [limitations of the composite](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/), including residual cloud and snow ambiguity and uniform deep-ocean color.

## Credit and reuse

Credit the imagery to **NASA Earth Observatory**. Reto Stöckli produced Blue Marble Next Generation at NASA Earth Observatory, NASA Goddard Space Flight Center. The [dataset's credit section](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/) requests the NASA Earth Observatory credit.

The imagery follows [NASA's images and media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). Those guidelines permit factual educational and informational use, including computer simulations and web pages, with acknowledgement and without implied NASA endorsement. They distinguish protected logos and third-party material. The source page does not identify a separate third-party copyright holder for this base map. The application code's license does not replace these imagery terms. The texture contains no NASA logo.

Screenshots and recorded walkthroughs that show the textured globe also show this NASA imagery. Retain the NASA Earth Observatory credit when distributing those project visuals. The visual is an educational rendering and does not imply a NASA partnership or endorsement.

## Files and coordinates

`fixtures/earth/manifest.json` records source URLs, retrieval time, dimensions, byte counts, SHA-256 hashes, the derivative recipe, and the projection check. Its `files` object covers both JPEG files.

| File | Dimensions | Bytes | Role |
| --- | --- | ---: | --- |
| `source-blue-marble-2004-07-5400.jpg` | 5400 × 2700 | 1,617,810 | Unmodified NASA download. |
| `blue-marble-2004-07-4096.jpg` | 4096 × 2048 | 806,194 | Local globe texture. |

The map is a WGS 84 longitude and latitude grid. Longitude increases left to right from −180° to +180°. Latitude decreases top to bottom from +90° to −90°. Pixel-edge coordinates follow these equations.

```text
x = (longitude + 180) / 360 * width
y = (90 - latitude) / 180 * height
```

The [paired NASA GeoTIFF](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july/world.200407.3x5400x2700_geo.tif) confirms this mapping. Its tags identify EPSG:4326, angular units in degrees, a top-left point at approximately −180°, +90°, and a pixel scale of approximately 0.0666666667° in each direction. The manifest preserves the values and the hash of the 12,175,080-byte GeoTIFF inspected during preparation. That larger verification download is not shipped.

The default Three.js `SphereGeometry` UV coordinates match `globeVector`'s reflected Z coordinate. Use the JPEG without horizontal reversal or longitude rotation, with `TextureLoader`'s normal vertical flip. This keeps earthquake and station coordinates on the corresponding land and ocean locations. The derivative preserves the source map's extent and orientation.

## Reproduce the texture

Run this command from the repository root with Pillow 12.2.0 and JPEG codec 6.2. Other codec versions can produce different JPEG bytes. The checked-in source removes the network requirement for this step.

```sh
python3 - <<'PY'
from hashlib import sha256
from pathlib import Path
from PIL import Image

root = Path('fixtures/earth')
source = root / 'source-blue-marble-2004-07-5400.jpg'
assert sha256(source.read_bytes()).hexdigest() == 'f55226d46d27e05511f2118dc6aa24f5dbf9b6b2cddc87cc6e0e7dd067c00b11'
image = Image.open(source).convert('RGB')
image = image.resize((4096, 2048), Image.Resampling.LANCZOS)
output = root / 'blue-marble-2004-07-4096.jpg'
image.save(output, format='JPEG', quality=88, subsampling=2,
           optimize=True, progressive=True)
assert sha256(output.read_bytes()).hexdigest() == '742ed25019ad1c3e9080ab01e15be8c33c418a28383ba1e51788839c970d16cc'
print('Earth texture reproduced with the expected SHA-256.')
PY
```

The recipe resizes and compresses the source. It does not crop, rotate, flip, adjust color, add clouds, or infer surface relief.
