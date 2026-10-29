// Gamepad API polling (Xbox / PlayStation "standard" mapping) with edge detection and auto-repeat.
// Emits { pad, btn, down, repeat } where btn is up/down/left/right/a/b/x/y/start/select/lb/rb.
const BTN = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const DIRS = ['up', 'down', 'left', 'right'];
const DEAD = 0.5;
const REPEAT_DELAY = 320;
const REPEAT_RATE = 110;

const state = []; // per pad index: { name: { down, since, lastRep } }
let handler = null;
let raf = 0;
let onConnect = null;

function read(gp) {
  const out = {};
  for (const i in BTN) {
    const b = gp.buttons[i];
    if (b && (b.pressed || b.value > 0.5)) out[BTN[i]] = true;
  }
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (Math.abs(ax) > DEAD || Math.abs(ay) > DEAD) {
    if (Math.abs(ax) >= Math.abs(ay)) out[ax < 0 ? 'left' : 'right'] = true;
    else out[ay < 0 ? 'up' : 'down'] = true;
  }
  return out;
}

function poll(now) {
  raf = requestAnimationFrame(poll);
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let slot = 0;
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    const idx = slot++; // compact index: first connected pad = player 1
    const cur = read(gp);
    const st = (state[idx] ||= {});
    for (const name of new Set([...Object.keys(cur), ...Object.keys(st)])) {
      const was = st[name]?.down, is = !!cur[name];
      if (is && !was) { st[name] = { down: true, since: now, lastRep: now }; handler?.({ pad: idx, btn: name, down: true, repeat: false }); }
      else if (!is && was) { st[name].down = false; handler?.({ pad: idx, btn: name, down: false, repeat: false }); }
      else if (is && DIRS.includes(name) && now - st[name].since > REPEAT_DELAY && now - st[name].lastRep > REPEAT_RATE) {
        st[name].lastRep = now;
        handler?.({ pad: idx, btn: name, down: true, repeat: true });
      }
    }
  }
}

export function initGamepads(fn, connectFn) {
  handler = fn;
  onConnect = connectFn;
  window.addEventListener('gamepadconnected', (e) => onConnect?.(e.gamepad, true));
  window.addEventListener('gamepaddisconnected', (e) => onConnect?.(e.gamepad, false));
  if (!raf) raf = requestAnimationFrame(poll);
}

export function connectedPads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return [...pads].filter((p) => p && p.connected).length;
}
