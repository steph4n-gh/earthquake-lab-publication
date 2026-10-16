#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = fs.realpathSync('.');
let checked = 0;
function verify(file, expected) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(actual, expected, `${file} differs from its frozen provenance. Regenerate and review the manifest before building.`);
  checked++;
}
const producers = {
  'fixtures/investigation': ['scripts/investigation-data/prepare.py', 'fixtures/investigation/catalog-facts.json'],
  'fixtures/observed': ['scripts/fetch_waveforms.py', 'fixtures/investigation/catalog-facts.json'],
  'fixtures/events/maule-2010': ['scripts/prepare-events.py', 'fixtures/events/maule-2010/catalog-facts.json'],
  'fixtures/events/okhotsk-2013': ['scripts/prepare-events.py', 'fixtures/events/okhotsk-2013/catalog-facts.json'],
};
for (const directory of [...Object.keys(producers), 'fixtures/earth']) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
  for (const [file, record] of Object.entries(manifest.files)) verify(path.join(directory, file), record.sha256);
  if (producers[directory]) assert.deepEqual(Object.keys(manifest.producer_dependencies ?? {}).sort(), [...producers[directory], 'scripts/catalog_facts.py'].sort(), `${directory} must pin its producer, shared module and factual input.`);
  for (const [file, expected] of Object.entries(manifest.producer_dependencies ?? {})) {
    assert.ok(!path.isAbsolute(file) && !file.includes('\\') && file === path.posix.normalize(file) && !file.startsWith('../'), `Unsafe dependency path ${file}`);
    const resolved = fs.realpathSync(file);
    assert.ok(resolved.startsWith(root + path.sep), `Dependency escapes the repository: ${file}`);
    verify(resolved, expected);
  }
}
const model = JSON.parse(fs.readFileSync('fixtures/provenance.json'));
verify('fixtures/iasp91.json', model.model_sha256);
const land = JSON.parse(fs.readFileSync('fixtures/cartography/provenance.json'));
verify('fixtures/cartography/ne_110m_land.geojson', land.source_sha256);
verify('fixtures/cartography/land.json', land.derivative_sha256);
console.log(`Verified ${checked} frozen data, model, cartography and Earth imagery hashes before bundling.`);
