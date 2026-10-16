#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distribution = path.join(root, 'dist');
const noticePaths = ['LICENSE', 'NOTICE', 'THIRD_PARTY.md', 'SOURCE.md'];
const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
if (process.argv.length > (checkOnly ? 3 : 2)) { console.error('Usage: node scripts/package-dist.mjs [--check]'); process.exit(1); }
function licenseFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, directory), {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...licenseFiles(file));
    else if (entry.isFile()) files.push(file);
    else throw new Error(`${file} is not a regular source file or directory.`);
  }
  return files;
}
try {
  if (!fs.lstatSync(distribution).isDirectory()) throw new Error('dist must be a real directory. Run the production build first.');
  if (!fs.lstatSync(path.join(root, 'licenses')).isDirectory()) throw new Error('licenses must be a real source directory.');
  const files = [...noticePaths, ...licenseFiles('licenses')];
  if (files.length === noticePaths.length) throw new Error('licenses must contain the third-party license files.');
  const failures = [];
  for (const file of files) {
    const source = path.join(root, file);
    const target = path.join(distribution, file);
    if (!fs.existsSync(source) || !fs.lstatSync(source).isFile()) { failures.push(`${file}: required regular source file is missing.`); continue; }
    let parent = distribution;
    let missingParent = false;
    for (const directory of path.dirname(file).split(path.sep).filter(value => value !== '.')) {
      parent = path.join(parent, directory);
      if (!fs.existsSync(parent)) {
        if (checkOnly) { missingParent = true; break; }
        fs.mkdirSync(parent);
      }
      if (!fs.lstatSync(parent).isDirectory()) throw new Error(`${file}: output parent must be a real directory.`);
    }
    if (missingParent) { failures.push(`dist/${file}: required output file is missing.`); continue; }
    let output;
    try { output = fs.lstatSync(target); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (output && !output.isFile()) throw new Error(`${file}: output must be a regular file.`);
    if (!checkOnly) {
      fs.copyFileSync(source, target);
    }
    if (checkOnly && !output) failures.push(`dist/${file}: required output file is missing.`);
    else if (!fs.readFileSync(source).equals(fs.readFileSync(target))) failures.push(`dist/${file}: output differs from its source bytes.`);
  }
  console.log(JSON.stringify({verdict: failures.length ? 'FAIL' : 'PASS', mode: checkOnly ? 'check' : 'copy', files, failures}, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) { console.error(`Distribution notices failed. ${error.message}`); process.exitCode = 1; }
