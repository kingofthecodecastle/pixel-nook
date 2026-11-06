import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { applyScoresCors } from '../api/scores.js';

function request(method = 'GET', origin, extraHeaders = {}) {
  return { method, url: '/api/scores?game=snake', headers: { host: 'pixel-nook-tawny.vercel.app', ...(origin ? { origin } : {}), ...extraHeaders } };
}
function response() {
  return { statusCode: 200, headers: {}, body: undefined,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(body) { this.body = body; },
  };
}

test('both bundled origins can preflight JSON scores without accessing Neon', async () => {
  const before = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Preflight must not access a database'); };
  try {
    for (const origin of ['capacitor://localhost', 'https://localhost']) {
      const res = response();
      await handler(request('OPTIONS', origin, { 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' }), res);
      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['access-control-allow-origin'], origin);
      assert.equal(res.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
      assert.match(res.headers.vary, /Origin/);
      assert.equal(res.headers['access-control-allow-credentials'], undefined);
    }
  } finally { globalThis.fetch = before; }
});

test('untrusted origins, methods and requested headers are refused before database work', async () => {
  for (const req of [
    request('POST', 'https://attacker.example'),
    request('GET', 'null'),
    request('OPTIONS', 'capacitor://localhost', { 'access-control-request-method': 'DELETE' }),
    request('OPTIONS', 'capacitor://localhost', { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' }),
  ]) {
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
  }
  const res = response();
  await handler(request('DELETE', 'https://localhost'), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, POST, OPTIONS');
});

test('same-origin web and exact configured HTTPS origins remain supported', () => {
  for (const origin of [undefined, 'https://pixel-nook-tawny.vercel.app', 'https://example.com']) {
    const res = response();
    assert.equal(applyScoresCors(request('GET', origin), res, 'https://example.com'), true);
    assert.equal(res.headers.vary, 'Origin');
  }
  for (const configured of ['*', 'https://evil.example/path', 'https://user:pass@evil.example', 'http://evil.example']) {
    const res = response();
    assert.equal(applyScoresCors(request('GET', 'https://evil.example'), res, configured), false);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  }
});

test('database failure still includes mobile CORS and does not disclose credentials', async () => {
  const beforeFetch = globalThis.fetch;
  const beforeDatabase = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://private:secret@db.example/db';
  globalThis.fetch = async () => { throw new Error('private connection error'); };
  try {
    const res = response();
    await handler(request('GET', 'capacitor://localhost'), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['access-control-allow-origin'], 'capacitor://localhost');
    assert.deepEqual(JSON.parse(res.body), { error: 'leaderboard unavailable' });
  } finally {
    globalThis.fetch = beforeFetch;
    if (beforeDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = beforeDatabase;
  }
});

test('mobile GET and POST share existing scores; initialization never removes rows', async () => {
  const beforeFetch = globalThis.fetch;
  const beforeDatabase = process.env.DATABASE_URL;
  const queries = [];
  const scores = [{ name: 'KAI', score: 420 }, { name: 'TST', score: 100 }];
  process.env.DATABASE_URL = 'postgres://private:secret@db.example/db';
  globalThis.fetch = async (_url, opts) => {
    const { query, params } = JSON.parse(opts.body);
    queries.push(query);
    let rows = [];
    if (query.startsWith('SELECT name, score')) rows = scores;
    if (query.includes('AS m,')) rows = [{ m: 0, h: 0 }];
    if (query.includes('AS n FROM scores')) rows = [{ n: 0 }];
    if (query.includes('AS rank')) rows = [{ rank: 1 }];
    if (query.startsWith('INSERT')) scores.unshift({ name: params[1], score: params[2] });
    return { ok: true, json: async () => ({ rows }) };
  };
  try {
    const get = response();
    await handler(request('GET', 'https://localhost'), get);
    assert.equal(get.statusCode, 200);
    assert.deepEqual(JSON.parse(get.body).scores, scores);
    assert.equal(get.headers['access-control-allow-origin'], 'https://localhost');
    assert.equal(get.headers.vary, 'Origin');
    assert.equal(get.headers['cache-control'], 'public, max-age=0, s-maxage=5');
    // Every cacheable response must vary by Origin; switching between native
    // platforms and a browser must never reuse the previous ACAO header.
    for (const origin of ['capacitor://localhost', undefined]) {
      const nextGet = response();
      await handler(request('GET', origin), nextGet);
      assert.equal(nextGet.statusCode, 200);
      assert.equal(nextGet.headers.vary, 'Origin');
      assert.equal(nextGet.headers['access-control-allow-origin'], origin);
    }
    const post = response();
    await handler({ ...request('POST', 'capacitor://localhost'), body: { game: 'snake', name: 'NEW', score: 600 } }, post);
    assert.equal(post.statusCode, 201);
    assert.deepEqual(JSON.parse(post.body).scores.map((s) => s.name), ['NEW', 'KAI', 'TST']);
    assert.equal(post.headers['access-control-allow-origin'], 'capacitor://localhost');
    assert.ok(queries.some((q) => q.startsWith('CREATE TABLE IF NOT EXISTS scores')));
    assert.ok(queries.every((q) => !/\b(DELETE|DROP|TRUNCATE|UPDATE)\b/i.test(q)));
  } finally {
    globalThis.fetch = beforeFetch;
    if (beforeDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = beforeDatabase;
  }
});
