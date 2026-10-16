#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

if (process.argv.length > 2) { console.error('Usage: node scripts/test-project-checks.mjs'); process.exit(1); }
const source = process.cwd();
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'earthquake-lab-checks-'));
const checks = [];
const repository = 'https://github.com/steph4n-gh/earthquake-lab-publication';
function write(file, value) {
  const target = path.join(fixture, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, value);
}
function command(file, args = []) {
  const result = spawnSync(process.execPath, [path.join(fixture, 'scripts', file), ...args], {cwd: fixture, encoding: 'utf8'});
  assert.ifError(result.error);
  return {status: result.status, output: result.stdout + result.stderr};
}
function expect(result, status, diagnostic, name) {
  assert.equal(result.status, status, `${name}\n${result.output}`);
  if (diagnostic) assert.ok(result.output.includes(diagnostic), `${name} must identify ${diagnostic}\n${result.output}`);
  checks.push({name, exitCode: result.status, diagnostic});
}
function rejectDocument(markdown, diagnostic, name) {
  write('README.md', markdown);
  expect(command('verify-project.mjs'), 1, diagnostic, name);
  write('README.md', goodReadme);
}
function snapshot(directory) {
  const values = {};
  function visit(file) {
    const stat = fs.lstatSync(file);
    const local = path.relative(directory, file);
    values[local] = {directory: stat.isDirectory(), modifiedMs: stat.mtimeMs, changedMs: stat.ctimeMs};
    if (stat.isDirectory()) for (const entry of fs.readdirSync(file).sort()) visit(path.join(file, entry));
    else values[local].sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  visit(directory);
  return values;
}
function readOnlyCheck(diagnostic, name) {
  const before = snapshot(path.join(fixture, 'dist'));
  expect(command('package-dist.mjs', ['--check']), 1, diagnostic, name);
  assert.deepEqual(snapshot(path.join(fixture, 'dist')), before, `${name} must not repair or write output.`);
}
const goodReadme = '[Guide](docs/guide.md#readme)\n![Image](<docs/a (b).svg>)\n[Escaped](docs/a\\ \\(b\\).svg)\n[Encoded](docs/a%20%28b%29.svg?download=1#x)\n[Reference][guide]\n\n[guide]: docs/guide.md "Guide"\n\n`[Code](missing-inline.md)`\n\n```md\n[Code](missing-fenced.md)\n```\n\n~~~md\n[Code](missing-tilde.md)\n~~~\n\n[Remote](https://example.invalid/absent)\n[Anchor](#absent-heading)\n';
try {
  const initialized = spawnSync('git', ['init', '--quiet'], {cwd: fixture, encoding: 'utf8'});
  assert.ifError(initialized.error); assert.equal(initialized.status, 0, initialized.stderr);
  for (const file of ['verify-project.mjs', 'package-dist.mjs']) write(`scripts/${file}`, fs.readFileSync(path.join(source, 'scripts', file)));
  const pkg = {name: 'earthquake-lab', version: '0.1.0', private: true, license: 'LGPL-3.0-only', description: 'A bounded earthquake investigation lab.', keywords: ['earthquake'], engines: {node: '>=24'}, repository: {type: 'git', url: `${repository}.git`}, homepage: `${repository}#readme`, bugs: {url: `${repository}/issues`}};
  write('package.json', JSON.stringify(pkg));
  write('Cargo.toml', `[package]\nname = "taup-core"\nversion = "0.1.0"\nedition = "2021"\nlicense = "LGPL-3.0-only"\ndescription = "A bounded numerical core."\nrepository = "${repository}"\n`);
  write('Cargo.lock', 'version = 4\n\n[[package]]\nname = "taup-core"\nversion = "0.1.0"\n');
  write('src/lib.rs', 'pub fn example() {}\n');
  write('index.html', '<!doctype html><title>Earthquake Lab | Investigate real earthquakes</title><link rel="icon" href="/favicon.svg">\n');
  write('public/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  write('.gitignore', '.audit/\nscratch/\n');
  write('README.md', goodReadme);
  write('docs/guide.md', '[Readme](../README.md)\n');
  write('docs/a (b).svg', '<svg/>\n');
  write('.cursor/skills/verify-taup-workbench/SKILL.md', '# Verification\n');
  expect(command('verify-project.mjs'), 0, '"verdict": "PASS"', 'Valid metadata and supported Markdown forms pass.');
  rejectDocument('[Missing](docs/absent.md)\n', 'README.md: local target is missing', 'Missing document fails.');
  write('.audit/receipt.json', '{}\n');
  rejectDocument('[Private receipt](.audit/receipt.json)\n', 'README.md: local target is ignored or generated', 'An existing ignored audit target fails.');
  write('scratch/receipt.json', '{}\n');
  rejectDocument('[Other ignored receipt](scratch/receipt.json)\n', 'README.md: local target is ignored', 'A Git-ignored target outside the built-in list fails.');
  rejectDocument('[Outside](../outside.md)\n', 'README.md: local target leaves the repository', 'Traversal outside the repository fails.');
  rejectDocument('[Machine](/Users/example/report.md)\n', 'README.md: absolute local target is not portable', 'A machine-absolute local path fails.');
  rejectDocument('[Machine](file:///Users/example/report.md)\n', 'README.md: absolute local target is not portable', 'A file URL fails.');
  rejectDocument('[Reference][bad]\n\n[bad]: docs/absent.md\n', 'README.md: local target is missing', 'A missing Markdown reference target fails.');
  write('package.json', JSON.stringify({...pkg, repository: {type: 'git', url: 'https://github.com/example/wrong'}}));
  expect(command('verify-project.mjs'), 1, 'package.json: repository', 'Wrong canonical repository metadata fails.');
  write('package.json', JSON.stringify({...pkg, engines: {node: '>=24 || >=20'}}));
  expect(command('verify-project.mjs'), 1, 'package.json: engines.node', 'A Node range that also admits an unsupported version fails.');
  write('package.json', JSON.stringify(pkg));
  write('Cargo.toml', fs.readFileSync(path.join(fixture, 'Cargo.toml'), 'utf8').replace('version = "0.1.0"', 'version = "0.2.0"'));
  expect(command('verify-project.mjs'), 1, 'Cargo metadata: taup-core version', 'Mismatched Cargo version fails.');
  write('Cargo.toml', fs.readFileSync(path.join(fixture, 'Cargo.toml'), 'utf8').replace('version = "0.2.0"', 'version = "0.1.0"'));
  write('index.html', '<title>Earthquake Lab</title><link rel="icon" href="data:,">\n');
  expect(command('verify-project.mjs'), 1, 'index.html: favicon', 'A placeholder favicon fails.');
  write('index.html', '<title>Earthquake Lab</title><link rel="icon" href="/favicon.svg">\n');
  expect(command('verify-project.mjs'), 0, '"verdict": "PASS"', 'Restored project metadata and links pass.');
  for (const file of ['LICENSE', 'NOTICE', 'THIRD_PARTY.md', 'SOURCE.md']) write(file, `${file} fixture notice with unchanged bytes.\n`);
  write('licenses/three.txt', 'Three.js license fixture.\n');
  write('licenses/nested/NOTICE.txt', 'Nested license fixture.\n');
  write('dist/index.html', '<title>Built fixture</title>\n');
  expect(command('package-dist.mjs'), 0, '"verdict": "PASS"', 'Notice packaging copies the complete license tree.');
  const before = snapshot(path.join(fixture, 'dist'));
  expect(command('package-dist.mjs', ['--check']), 0, '"verdict": "PASS"', 'Read-only distribution check accepts exact bytes.');
  assert.deepEqual(snapshot(path.join(fixture, 'dist')), before);
  assert.equal(fs.readFileSync(path.join(fixture, 'dist/licenses/nested/NOTICE.txt'), 'utf8'), 'Nested license fixture.\n');
  fs.unlinkSync(path.join(fixture, 'dist/licenses/three.txt'));
  readOnlyCheck('dist/licenses/three.txt: required output file is missing', 'A missing license fails without being restored.');
  expect(command('package-dist.mjs'), 0, '"verdict": "PASS"', 'Normal packaging restores the missing license.');
  write('dist/NOTICE', 'Modified output notice.\n');
  readOnlyCheck('dist/NOTICE: output differs from its source bytes', 'A modified notice fails without being repaired.');
  expect(command('package-dist.mjs'), 0, '"verdict": "PASS"', 'Normal packaging restores the source notice bytes.');
  fs.unlinkSync(path.join(fixture, 'SOURCE.md'));
  readOnlyCheck('SOURCE.md: required regular source file is missing', 'A missing corresponding-source instruction fails.');
  console.log(JSON.stringify({verdict: 'PASS', isolation: 'Disposable temporary repository. The working docs and distribution were not mutated.', checks}, null, 2));
} finally { fs.rmSync(fixture, {recursive: true, force: true}); }
