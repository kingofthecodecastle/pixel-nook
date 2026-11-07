import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/app-ads.js';

test('seller verification fails closed until a real account is configured', () => {
  const before = process.env.ADMOB_PUBLISHER_ID;
  function request(method, publisher) {
    process.env.ADMOB_PUBLISHER_ID = publisher;
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
    handler({ method }, response);
    return response;
  }
  try {
    for (const value of ['', 'pub-0000000000000000', 'pub-3940256099942544', 'pub-1234567890123456\n', 'pub-1234567890123456\ninjected']) {
      const r = request('GET', value);
      assert.equal(r.statusCode, 404);
      assert.ok(!r.body.includes('google.com'));
    }
    const r = request('GET', 'pub-1234567890123456');
    assert.equal(r.statusCode, 200);
    assert.equal(r.body, 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
    assert.equal(r.headers['Content-Type'], 'text/plain; charset=utf-8');
    assert.equal(request('HEAD', 'pub-1234567890123456').body, '');
    assert.equal(request('POST', 'pub-1234567890123456').statusCode, 405);
  } finally {
    if (before === undefined) delete process.env.ADMOB_PUBLISHER_ID;
    else process.env.ADMOB_PUBLISHER_ID = before;
  }
});
