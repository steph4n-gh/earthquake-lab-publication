#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const repository = 'https://github.com/steph4n-gh/earthquake-lab-publication';
const failures = [];
const checkedMetadata = [];
const links = [];
const generated = ['.git', '.audit', '.cache', '.venv', 'node_modules', 'target', 'dist', 'web/pkg'];
const relative = file => path.relative(root, file).split(path.sep).join('/');
const inside = file => file === root || (!path.relative(root, file).startsWith(`..${path.sep}`) && path.relative(root, file) !== '..' && !path.isAbsolute(path.relative(root, file)));
function requireValue(condition, message) {
  if (!condition) failures.push(message);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { failures.push(`${relative(file)}: ${error.message}`); return null; }
}
function checkMetadata() {
  const pkg = readJson(path.join(root, 'package.json'));
  const command = spawnSync('cargo', ['metadata', '--locked', '--no-deps', '--format-version', '1'], {cwd: root, encoding: 'utf8'});
  let cargo;
  if (command.error || command.status !== 0) failures.push(`cargo metadata: ${command.error?.message || command.stderr.trim() || `exit ${command.status}`}`);
  else {
    try {
      const metadata = JSON.parse(command.stdout);
      cargo = metadata.packages.find(item => item.name === 'taup-core' && metadata.workspace_members.includes(item.id));
      requireValue(cargo, 'Cargo metadata: workspace package taup-core is missing.');
    } catch (error) { failures.push(`cargo metadata: ${error.message}`); }
  }
  if (pkg) {
    requireValue(pkg.name === 'earthquake-lab', 'package.json: name must be earthquake-lab.');
    requireValue(pkg.private === true, 'package.json: private must remain true because the application is not an npm publication.');
    requireValue(typeof pkg.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version), 'package.json: version must be a semantic release version.');
    requireValue(pkg.license === 'LGPL-3.0-only', 'package.json: license must be LGPL-3.0-only.');
    requireValue(typeof pkg.description === 'string' && pkg.description.trim().length > 0, 'package.json: description must be nonempty.');
    requireValue(Array.isArray(pkg.keywords) && pkg.keywords.length > 0 && pkg.keywords.every(value => typeof value === 'string' && value.trim()), 'package.json: keywords must contain nonempty strings.');
    const nodeFloor = typeof pkg.engines?.node === 'string' && pkg.engines.node.match(/^>=\s*(\d+)(?:\.\d+(?:\.\d+)?)?$/);
    requireValue(nodeFloor && Number(nodeFloor[1]) >= 24, 'package.json: engines.node must declare a single Node.js lower bound of at least 24, such as >=24.');
    requireValue(pkg.repository?.type === 'git' && typeof pkg.repository.url === 'string' && pkg.repository.url.replace(/\.git$/, '') === repository, `package.json: repository must be a git record with URL ${repository}, optionally ending in .git.`);
    requireValue(pkg.homepage === repository || pkg.homepage === `${repository}#readme`, `package.json: homepage must be ${repository} or its #readme fragment.`);
    requireValue(pkg.bugs?.url === `${repository}/issues`, `package.json: bugs.url must be ${repository}/issues.`);
    checkedMetadata.push('npm name, private status, version, license, description, keywords, Node engine, repository, homepage and issues');
    if (cargo) {
      requireValue(cargo.version === pkg.version, `Cargo metadata: taup-core version ${cargo.version} differs from package.json ${pkg.version}.`);
      requireValue(cargo.license === pkg.license, `Cargo metadata: taup-core license ${cargo.license} differs from package.json ${pkg.license}.`);
      requireValue(cargo.repository === repository, `Cargo metadata: taup-core repository must be ${repository}.`);
      requireValue(typeof cargo.description === 'string' && cargo.description.trim().length > 0, 'Cargo metadata: taup-core description must be nonempty.');
      checkedMetadata.push('Cargo workspace package version, license, description and repository');
    }
  }
  let html;
  try { html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); }
  catch (error) { failures.push(`index.html: ${error.message}`); return; }
  const title = html.match(/<title\b[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  requireValue(typeof title === 'string' && /^Earthquake Lab(?:\s*[·|:]\s*\S.*)?$/.test(title), 'index.html: title must identify Earthquake Lab.');
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const icon = tags.find(tag => /\brel\s*=\s*["'](?:[^"']*\s)?icon(?:\s[^"']*)?["']/i.test(tag));
  const href = icon?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!href || /^(?:[A-Za-z][\w+.-]*:|\/\/)/.test(href)) failures.push('index.html: favicon must reference a repository-local file.');
  else {
    let iconPath;
    try {
      const value = decodeURIComponent(href.split(/[?#]/, 1)[0]);
      iconPath = value.startsWith('/') ? path.resolve(root, 'public', `.${value}`) : path.resolve(root, value);
      checkTarget('index.html favicon', iconPath);
      requireValue(fs.existsSync(iconPath) && fs.statSync(iconPath).isFile(), 'index.html: favicon must reference a regular source file.');
    } catch (error) { failures.push(`index.html favicon: ${error.message}`); }
  }
  checkedMetadata.push('HTML product title and local favicon');
}
function markdownFiles(directory) {
  if (!fs.existsSync(directory)) { failures.push(`${relative(directory)}: documentation directory is missing.`); return []; }
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(file));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(file);
  }
  return files;
}
function prose(markdown) {
  let fence;
  return markdown.split('\n').map(line => {
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter && (!fence || delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length)) { fence = fence ? null : delimiter[1]; return ''; }
    return fence ? '' : line.replace(/(`+)[\s\S]*?\1/g, '');
  }).join('\n').replace(/<!--[\s\S]*?-->/g, '');
}
function destinations(markdown) {
  const text = prose(markdown);
  const targets = [];
  const pattern = /!?\[(?:\\.|[^\]\\])*\]\(\s*(<[^>\n]*>|(?:\\.|[^\s()\\]|\([^()\n]*\))+)\s*(?:["'][^\n]*?["']\s*)?\)|^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)/gm;
  for (const match of text.matchAll(pattern)) targets.push((match[1] || match[2]).replace(/^<|>$/g, '').replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\\\]^_`{|}~ ])/g, '$1'));
  return targets;
}
function checkTarget(source, target) {
  if (!inside(target)) { failures.push(`${source}: local target leaves the repository (${target}).`); return; }
  const local = relative(target);
  if (generated.some(prefix => local === prefix || local.startsWith(`${prefix}/`))) { failures.push(`${source}: local target is ignored or generated (${local}).`); return; }
  if (!fs.existsSync(target)) { failures.push(`${source}: local target is missing (${local}).`); return; }
  const realTarget = fs.realpathSync(target);
  if (!inside(realTarget)) { failures.push(`${source}: local target resolves outside the repository (${local}).`); return; }
  const realLocal = relative(realTarget);
  if (generated.some(prefix => realLocal === prefix || realLocal.startsWith(`${prefix}/`))) { failures.push(`${source}: local target resolves into ignored or generated files (${local}).`); return; }
  links.push({source, target: local});
  if (realLocal !== local) links.push({source, target: realLocal});
}
function checkLinks(files) {
  for (const file of files) {
    for (const destination of destinations(fs.readFileSync(file, 'utf8'))) {
      if (!destination || destination.startsWith('#')) continue;
      if (destination.startsWith('//')) continue;
      if (/^file:/i.test(destination) || path.isAbsolute(destination) || /^[A-Za-z]:[\\/]/.test(destination) || destination.startsWith('\\\\')) { failures.push(`${relative(file)}: absolute local target is not portable (${destination}).`); continue; }
      if (/^[A-Za-z][\w+.-]*:/.test(destination)) continue;
      try {
        const local = decodeURIComponent(destination.split(/[?#]/, 1)[0]);
        if (!local) continue;
        if (path.isAbsolute(local) || /^[A-Za-z]:[\\/]/.test(local)) { failures.push(`${relative(file)}: absolute local target is not portable (${destination}).`); continue; }
        checkTarget(relative(file), path.resolve(path.dirname(file), local));
      } catch (error) { failures.push(`${relative(file)}: invalid local target ${destination} (${error.message}).`); }
    }
  }
  if (links.length) {
    const result = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {cwd: root, input: [...new Set(links.map(link => link.target))].join('\0') + '\0', encoding: 'utf8'});
    if (result.error || ![0, 1].includes(result.status)) failures.push(`git check-ignore: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`);
    else {
      const ignored = new Set(result.stdout.split('\0').filter(Boolean));
      for (const link of links) if (ignored.has(link.target)) failures.push(`${link.source}: local target is ignored (${link.target}).`);
    }
  }
}
if (process.argv.length > 2) { console.error('Usage: node scripts/verify-project.mjs'); process.exit(1); }
checkMetadata();
const files = fs.readdirSync(root, {withFileTypes: true}).filter(entry => entry.isFile() && entry.name.endsWith('.md')).map(entry => path.join(root, entry.name));
files.push(...markdownFiles(path.join(root, 'docs')), ...markdownFiles(path.join(root, '.cursor/skills/verify-taup-workbench')));
checkLinks(files);
const report = {verdict: failures.length ? 'FAIL' : 'PASS', checkedDocuments: files.length, checkedLocalTargets: links.length, checkedMetadata, scope: 'Local file targets, inline Markdown links and reference definitions. Fenced code, inline code, remote HTTP health and heading fragments are outside this check.', failures};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
