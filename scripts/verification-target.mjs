import assert from 'node:assert/strict';

async function readToken() {
  const terminal = process.stdin.isTTY;
  if (terminal) {
    process.stdin.setRawMode(true);
    process.stderr.write('Ready for private Site verification JSON on stdin (input is hidden).\n');
  }
  const input = await new Promise((resolve, reject) => {
    let text = '';
    const finish = error => {
      process.stdin.off('data', receive);
      process.stdin.off('end', end);
      process.stdin.pause();
      if (terminal) process.stdin.setRawMode(false);
      error ? reject(error) : resolve(text);
    };
    const receive = chunk => {
      text += chunk;
      if (text.includes('\u0003') || text.length > 65536) finish(new Error('Invalid Site verification input.'));
      else if (text.includes('\n')) finish();
    };
    const end = () => finish();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', receive);
    process.stdin.once('end', end);
    process.stdin.resume();
  });
  let value;
  try { value = JSON.parse(input).token; } catch { throw new Error('Provide Site verification JSON on stdin.'); }
  assert.ok(typeof value === 'string' && value.length > 0 && !/[\r\n\0]/.test(value), 'A Site service token is required.');
  return value;
}

export async function verificationTarget(port) {
  const hosted = Boolean(process.env.TAUP_URL);
  const parsed = new URL(process.env.TAUP_URL || `http://127.0.0.1:${port}/`);
  assert.ok(!parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname === '/', 'Use a Site root URL without credentials, query or fragment.');
  assert.ok(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)), 'Hosted verification requires HTTPS; HTTP is allowed only on loopback.');
  const token = hosted ? await readToken() : null;
  const headers = request => {
    const result = Object.fromEntries(Object.entries(request.headers()).filter(([name]) => name.toLowerCase() !== 'oai-sites-authorization'));
    if (new URL(request.url()).origin === parsed.origin) result['OAI-Sites-Authorization'] = `Bearer ${token}`;
    return result;
  };
  return {
    hosted,
    url: parsed.href,
    evidenceScope: hosted ? 'Site-only service authorization, not interactive visitor identity. Traces and HAR are disabled to avoid persisting credentials.' : 'Owned local production preview with browser traces.',
    async probe() {
      const response = await fetch(parsed, {headers: {'OAI-Sites-Authorization': `Bearer ${token}`}, redirect: 'error', signal: AbortSignal.timeout(30000)});
      assert.equal(response.status, 200, 'The private Site must authorize this verification run.');
      assert.ok((await response.text()).includes('Earthquake Lab'));
    },
    async newContext(browser, options) {
      const context = await browser.newContext(options);
      if (hosted) await context.route('**/*', async route => {
        if (new URL(route.request().url()).origin !== parsed.origin) return route.continue({headers: headers(route.request())});
        try {
          const response = await route.fetch({headers: headers(route.request()), maxRedirects: 0});
          await route.fulfill({response});
        } catch (error) {
          throw new Error(String(error).replaceAll(token, '[redacted]'));
        }
      });
      return context;
    },
    async startTrace(context, options) { if (!hosted) await context.tracing.start(options); },
    async stopTrace(context, options) { if (!hosted) await context.tracing.stop(options); },
  };
}
