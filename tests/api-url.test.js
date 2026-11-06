import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveScoresApi } from '../src/api-url.js';

test('web keeps the existing relative endpoint; native requires an explicit endpoint', () => {
  assert.equal(resolveScoresApi(), '/api/scores');
  assert.throws(() => resolveScoresApi({ native: true }), /VITE_SCORES_API_URL/);
  assert.equal(resolveScoresApi({ native: true, configured: 'https://pixel-nook-tawny.vercel.app/api/scores' }), 'https://pixel-nook-tawny.vercel.app/api/scores');
});

test('public endpoint configuration rejects credentials and unsafe or ambiguous URLs', () => {
  for (const configured of ['/api/scores', '//example.com/api/scores', 'http://example.com/api/scores', 'https://user:secret@example.com/api/scores', 'https://example.com/api/scores?token=secret', 'https://example.com/api/scores#fragment', 'postgres://secret@example.com/db']) {
    assert.throws(() => resolveScoresApi({ native: true, configured }), /HTTPS/);
  }
});
