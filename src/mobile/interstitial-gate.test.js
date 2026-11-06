import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterstitialGate } from './interstitial-gate.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function timers() {
  const pending = new Set();
  return {
    setTimer: callback => { pending.add(callback); return callback; },
    clearTimer: callback => pending.delete(callback),
    fire: () => { for (const callback of [...pending]) callback(); },
  };
}

test('initial launches do not prepare or show an interstitial', async () => {
  const gate = createInterstitialGate({ adapter: {
    prepare: () => assert.fail('prepare on initial launch'),
    show: () => assert.fail('show on initial launch'),
  } });
  assert.equal((await gate.beforeNextRound()).reason, 'no-game-over');
});

test('duplicate restart and game-over transitions share one presentation', async () => {
  let shows = 0;
  const closed = deferred();
  const gate = createInterstitialGate({ adapter: {
    prepare: async () => true,
    show: ({ onShown }) => { shows += 1; onShown(); return closed.promise; },
  } });
  gate.noteGameOver();
  const first = gate.beforeNextRound();
  assert.strictEqual(first, gate.beforeNextRound());
  gate.noteGameOver();
  await tick();
  assert.equal(shows, 1);
  closed.resolve('dismissed');
  assert.equal((await first).shown, true);
  assert.equal((await gate.beforeNextRound()).reason, 'no-game-over');
});

test('failed preparation skips the ad without stopping the next round', async () => {
  const gate = createInterstitialGate({ adapter: {
    prepare: async () => { throw new Error('offline'); },
    show: () => assert.fail('failed ad must not show'),
  } });
  gate.noteGameOver();
  assert.equal((await gate.beforeNextRound()).reason, 'unavailable');
});

test('late loading never pops an ad over a round that already started', async () => {
  const loading = deferred();
  const clock = timers();
  let shows = 0;
  const gate = createInterstitialGate({ ...clock, adapter: {
    prepare: () => loading.promise,
    show: async () => { shows += 1; return 'dismissed'; },
  } });
  gate.noteGameOver();
  const pending = gate.beforeNextRound();
  await tick();
  clock.fire();
  assert.equal((await pending).reason, 'unavailable');
  loading.resolve(true);
  await tick();
  assert.equal(shows, 0);
  assert.equal((await gate.beforeNextRound()).reason, 'no-game-over');
  gate.noteGameOver();
  assert.equal((await gate.beforeNextRound()).shown, true);
  assert.equal(shows, 1);
});

test('cooldown defaults to sixty seconds and cannot be below thirty', async () => {
  for (const [configured, expected] of [[undefined, 60_000], [1, 30_000]]) {
    let current = 0;
    const gate = createInterstitialGate({
      cooldownMs: configured,
      now: () => current,
      adapter: { prepare: async () => true, show: async () => 'dismissed' },
    });
    gate.noteGameOver();
    assert.equal((await gate.beforeNextRound()).shown, true);
    current = expected - 1;
    gate.noteGameOver();
    assert.equal((await gate.beforeNextRound()).reason, 'cooldown');
    current = expected;
    gate.noteGameOver();
    assert.equal((await gate.beforeNextRound()).shown, true);
  }
});

test('preparation deadline cannot release a visible native ad', async () => {
  const clock = timers();
  const closed = deferred();
  let resumed = false;
  const gate = createInterstitialGate({ ...clock, adapter: {
    prepare: async () => true,
    show: ({ onShown }) => { onShown(); return closed.promise; },
  } });
  gate.noteGameOver();
  const pending = gate.beforeNextRound().then(result => { resumed = true; return result; });
  await tick();
  clock.fire();
  await tick();
  assert.equal(resumed, false);
  closed.resolve('dismissed');
  assert.equal((await pending).shown, true);
});

test('invalidation discards a load completed under old consent', async () => {
  const loading = deferred();
  const gate = createInterstitialGate({ adapter: {
    prepare: () => loading.promise,
    show: () => assert.fail('stale preparation must not show'),
  } });
  const preload = gate.preload();
  gate.invalidate();
  loading.resolve(true);
  assert.equal(await preload, false);
});

test('backgrounding during preparation skips presentation without a late popup', async () => {
  const loading = deferred();
  let active = true;
  const gate = createInterstitialGate({ canPresent: () => active, adapter: {
    prepare: () => loading.promise,
    show: () => assert.fail('must not present over another app'),
  } });
  gate.noteGameOver();
  const next = gate.beforeNextRound();
  await tick();
  active = false;
  loading.resolve(true);
  assert.equal((await next).reason, 'background');
  active = true;
  assert.equal((await gate.beforeNextRound()).reason, 'no-game-over');
});
