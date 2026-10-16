import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import {verificationTarget} from './verification-target.mjs';

if (['--child', '--failure-child'].includes(process.argv[2])) {
  const target = await verificationTarget(Number(process.argv[3]));
  if (target.hosted) await target.probe();
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const context = await target.newContext(browser, {viewport: {width: 900, height: 700}});
    await target.startTrace(context, {screenshots: true, snapshots: true});
    await context.grantPermissions(['local-network-access']);
    const page = await context.newPage();
    page.on('console', message => { if (message.type()==='error') console.error(message.text()); });
    await page.goto(process.argv[2] === '--failure-child' ? new URL('/broken.js', target.url).href : target.url);
    try { await page.waitForFunction(() => window.sameLoaded && window.foreignLoaded && window.redirectLoaded); }
    catch (error) { console.error(JSON.stringify(await page.evaluate(() => ({same: Boolean(window.sameLoaded), foreign: Boolean(window.foreignLoaded), redirected: Boolean(window.redirectLoaded)})))); throw error; }
    await target.stopTrace(context, {path: process.argv[4]});
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'earthquake-verification-target-'));
const received = [];
let foreignOrigin;
const server = (name, handler) => http.createServer((request, response) => {
  received.push({name, path: request.url, authorization: request.headers['oai-sites-authorization']});
  handler(request, response);
});
const foreign = server('foreign', (request, response) => {
  response.setHeader('Content-Type', 'text/javascript');
  response.end(request.url === '/redirect.js' ? 'window.redirectLoaded=true' : 'window.foreignLoaded=true');
});
const own = server('own', (request, response) => {
  if (request.url === '/broken.js') { request.socket.destroy(); return; }
  if (request.url === '/redirect.js') {
    response.writeHead(302, {Location: foreignOrigin + '/redirect.js'}); response.end(); return;
  }
  if (request.url === '/same.js') {
    response.setHeader('Content-Type', 'text/javascript'); response.end('window.sameLoaded=true'); return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(`<title>Earthquake Lab transport controls</title><script src="/same.js"></script><script src="${foreignOrigin}/foreign.js"></script><script src="/redirect.js"></script>`);
});
const listen = target => new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
const close = target => new Promise(resolve => target.close(resolve));
async function run(url, trace, mode = '--child') {
  const env = {...process.env}; delete env.TAUP_URL;
  if (url) env.TAUP_URL = url;
  const child = spawn(process.execPath, [import.meta.filename, mode, String(own.address().port), trace], {env, stdio: ['pipe', 'pipe', 'pipe']});
  let output = '';
  child.stdout.on('data', chunk => {output += chunk;});
  child.stderr.on('data', chunk => {output += chunk;});
  child.stdin.end(JSON.stringify({token: 'dummy-transport-control'}) + '\n');
  const code = await new Promise(resolve => child.on('exit', resolve));
  if (mode === '--failure-child') {
    assert.notEqual(code, 0, 'A reset private resource must fail verification.');
    assert.ok(received.some(item => item.path === '/broken.js' && item.authorization === 'Bearer dummy-transport-control'));
    assert.ok(!output.includes('dummy-transport-control'), 'Failure output must omit the credential.');
  } else assert.equal(code, 0, output + JSON.stringify(received.map(item => ({...item, authorization: Boolean(item.authorization)}))));
}
try {
  await listen(foreign); foreignOrigin = `http://127.0.0.1:${foreign.address().port}`;
  await listen(own);
  const origin = `http://127.0.0.1:${own.address().port}/`;
  const privateTrace = path.join(temporary, 'private-trace.zip');
  await run(origin, privateTrace);
  const privateRequests = received.splice(0);
  assert.ok(privateRequests.filter(item => item.name === 'own').length >= 4);
  assert.ok(privateRequests.filter(item => item.name === 'own').every(item => item.authorization === 'Bearer dummy-transport-control'));
  assert.ok(privateRequests.some(item => item.name === 'foreign' && item.path === '/redirect.js'));
  assert.ok(privateRequests.filter(item => item.name === 'foreign').every(item => item.authorization === undefined), 'Neither direct nor redirected foreign requests may receive the service credential.');
  assert.equal(fs.existsSync(privateTrace), false, 'Private verification must not persist credential-bearing traces.');
  const localTrace = path.join(temporary, 'local-trace.zip');
  await run(null, localTrace);
  assert.ok(received.length > 0 && received.every(item => item.authorization === undefined));
  assert.ok(fs.statSync(localTrace).size > 0, 'Local verification retains real browser traces.');
  received.splice(0);
  await run(origin, path.join(temporary, 'failed-trace.zip'), '--failure-child');
  assert.equal(fs.existsSync(path.join(temporary, 'failed-trace.zip')), false);
  console.log('PASS: real same-origin authorization, direct and redirected cross-origin exclusion, private trace exclusion, redacted socket-reset failure and unchanged local transport.');
} finally {
  await close(own); await close(foreign);
  fs.rmSync(temporary, {recursive: true, force: true});
}
