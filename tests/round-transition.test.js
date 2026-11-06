import test from 'node:test';
import assert from 'node:assert/strict';
import { guardRoundTransitions } from '../src/mobile/round-transition.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture({ over = true } = {}) {
  const calls = [];
  const closed = deferred();
  let current;
  let allowed = true;
  let active = true;
  const raw = Object.fromEntries(['restart', 'start', 'setDir', 'turnLeft', 'turnRight', 'action', 'hardDrop', 'togglePause']
    .map(method => [method, (...args) => calls.push([method, ...args])]));
  // Simulate cartridge code that would restart directly if R leaked through.
  raw.onKey = event => { calls.push(['onKey', event.key]); if (event.key.toLowerCase() === 'r') raw.restart(); };
  const game = guardRoundTransitions(raw, {
    isOver: () => over,
    isCurrent: wrapper => current === wrapper,
    canRestart: () => allowed,
    canAutoStart: () => active,
    transition: () => { calls.push(['transition']); return closed.promise; },
  });
  current = game;
  return { game, calls, closed, setCurrent: value => { current = value; }, setAllowed: value => { allowed = value; }, setActive: value => { active = value; } };
}

test('keyboard restart cannot bypass the ad through a cartridge onKey closure', async () => {
  const f = fixture();
  let prevented = 0;
  f.game.onKey({ code: 'KeyR', key: 'r', preventDefault: () => { prevented += 1; } });
  assert.deepEqual(f.calls, [['transition']]);
  assert.equal(prevented, 1);
  f.closed.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.calls, [['transition'], ['restart']]);
});

test('repeated R does not queue a transition', () => {
  const f = fixture();
  f.game.onKey({ code: 'KeyR', key: 'R', repeat: true, preventDefault() {} });
  assert.deepEqual(f.calls, []);
});

test('buttons, gamepad methods, keyboard and concurrent restarts stay locked during an ad', async () => {
  const f = fixture();
  const first = f.game.restart({ autoStart: true });
  assert.equal(await f.game.restart(), false);
  for (const method of ['start', 'setDir', 'turnLeft', 'turnRight', 'action', 'hardDrop', 'togglePause']) f.game[method](1, 0);
  f.game.onKey({ key: 'ArrowLeft', preventDefault() {} });
  assert.deepEqual(f.calls, [['transition']]);
  f.closed.resolve();
  assert.equal(await first, true);
  assert.deepEqual(f.calls, [['transition'], ['restart'], ['start']]);
});

test('ordinary restart leaves the new round at its start screen', async () => {
  const f = fixture();
  const pending = f.game.restart();
  f.closed.resolve();
  assert.equal(await pending, true);
  assert.deepEqual(f.calls, [['transition'], ['restart']]);
});

test('restarting an unfinished round does not show an ad', async () => {
  const f = fixture({ over: false });
  assert.equal(await f.game.restart({ autoStart: true }), true);
  assert.deepEqual(f.calls, [['restart'], ['start']]);
});

test('a replaced or destroyed cartridge cannot reset when a pending ad closes', async () => {
  const f = fixture();
  const pending = f.game.restart({ autoStart: true });
  f.setCurrent(null);
  f.closed.resolve();
  assert.equal(await pending, false);
  assert.deepEqual(f.calls, [['transition']]);
});

test('a stale wrapper cannot restart or send input even without game over', async () => {
  const f = fixture({ over: false });
  f.setCurrent(null);
  assert.equal(await f.game.restart(), false);
  f.game.start();
  f.game.onKey({ key: 'r', preventDefault() {} });
  assert.deepEqual(f.calls, []);
});

test('a background or modal restriction introduced during the ad prevents automatic restart', async () => {
  const f = fixture();
  const pending = f.game.restart({ autoStart: true });
  f.setAllowed(false);
  f.closed.resolve();
  assert.equal(await pending, false);
  assert.deepEqual(f.calls, [['transition']]);
});

test('transition failure does not reset a game and unlocks a later retry', async () => {
  const f = fixture();
  const pending = f.game.restart();
  f.closed.reject(new Error('flush failed'));
  await assert.rejects(pending, /flush failed/);
  f.setCurrent(null);
  assert.equal(await f.game.restart(), false);
  assert.deepEqual(f.calls, [['transition']]);
});

test('auto-start is suppressed when app becomes inactive while the ad is open', async () => {
  const f = fixture();
  const pending = f.game.restart({ autoStart: true });
  f.setActive(false);
  f.closed.resolve();
  assert.equal(await pending, true);
  assert.deepEqual(f.calls, [['transition'], ['restart']]);
});
