// Shared engine for the Pixel Nook cartridges added in "Cabinet 2".
// Same contract as the original games: factory(canvas, hooks) -> { update, onKey, setDir, togglePause, restart, destroy }
// plus optional held-input helpers (onKeyUp, release, action, actionUp) used by main.js.
import { sfx } from '../audio.js';
import { saveHighScore, getHighScores } from '../storage.js';

export const FONT = '"Press Start 2P", monospace';

const CODEMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'action', Enter: 'action', KeyX: 'action', KeyZ: 'action',
};
const KEYMAP = {
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
  arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  ' ': 'action', enter: 'action', x: 'action', z: 'action',
};

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Draw a tiny bitmap sprite: rows of strings, '.' = transparent, other chars index into palette. */
export function sprite(ctx, rows, x, y, px, pal) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = pal[ch] || '#fff';
      ctx.fillRect(Math.round(x + c * px), Math.round(y + r * px), px, px);
    }
  }
}

export function makeGame(canvas, hooks, spec) {
  const ctx = canvas.getContext('2d');
  canvas.width = spec.W;
  canvas.height = spec.H;

  const keys = {};
  const raw = {};
  const pads = {};
  let last = performance.now();
  let statusTimer = 0;

  const api = {
    ctx, W: spec.W, H: spec.H, sfx, s: {},
    score: 0, lives: 0, over: false, paused: false, overMsg: '', noSave: false, t: 0,
    held(name) { return !!(keys[name] || pads[name]); },
    rawHeld(code) { return !!raw[code]; },
    padHeld(name) { return !!pads[name]; },
    add(n) { api.score += n; hooks.onScore(api.score); },
    setLives(n) { api.lives = n; hooks.onExtra?.({ lives: n }); },
    extra(label, value) { hooks.onExtra?.({ label, value }); },
    status(t) { hooks.onStatus(t); },
    flash(kind) { hooks.onFlash?.(kind); },
    note(t) {
      hooks.onStatus(t);
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => { if (!api.over && !api.paused) hooks.onStatus('Playing'); }, 900);
    },
    /** Lose a life. Returns true if that was the last one. */
    hit() {
      api.setLives(api.lives - 1);
      sfx.die();
      hooks.onFlash?.('die');
      if (api.lives <= 0) { api.gameOver(); return true; }
      api.note('Lives: ' + api.lives);
      return false;
    },
    gameOver(msg = '') {
      if (api.over) return;
      api.over = true;
      api.overMsg = msg;
      clearTimeout(statusTimer);
      sfx.die();
      hooks.onFlash?.('die');
      hooks.onStatus('Game Over');
      if (!api.noSave) saveHighScore(spec.id, api.score);
      hooks.onGameOver?.(api.score, getHighScores(spec.id));
    },
    text(str, x, y, size = 8, color = '#fff', align = 'center') {
      ctx.font = `${size}px ${FONT}`;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#000';
      ctx.fillText(str, x + 1, y + 1);
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
    },
  };

  function reset() {
    for (const k in keys) keys[k] = false;
    for (const k in pads) pads[k] = false;
    api.score = 0;
    api.over = false;
    api.paused = false;
    api.overMsg = '';
    api.noSave = false;
    api.t = 0;
    api.s = {};
    hooks.onScore(0);
    hooks.onStatus('Playing');
    spec.init(api);
    last = performance.now();
  }

  function press(name, code) {
    if (api.paused) return;
    spec.press?.(name, api, code);
  }

  function update(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.05);
    if (!api.paused && !api.over) {
      api.t += dt;
      spec.update(dt, api);
    }
    spec.draw(ctx, api);
    if (api.paused && !api.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, spec.W, spec.H);
      api.text('PAUSED', spec.W / 2, spec.H / 2, 12);
    }
    if (api.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, spec.W, spec.H);
      api.text(api.overMsg || 'GAME OVER', spec.W / 2, spec.H / 2 - 14, 10, '#ff6b6b');
      api.text(`SCORE ${api.score}`, spec.W / 2, spec.H / 2 + 10, 10, '#fff');
      api.text('R / RESTART', spec.W / 2, spec.H / 2 + 34, 7, '#9a8f7a');
    }
  }

  function onKey(e) {
    const c = e.code || '';
    const k = (e.key || '').toLowerCase();
    if (c === 'KeyP' || c === 'Escape' || k === 'p' || k === 'escape') { e.preventDefault(); togglePause(); return; }
    if ((c === 'KeyR' || k === 'r') && api.over) { e.preventDefault(); restart(); return; }
    const name = CODEMAP[c] || KEYMAP[k];
    if (c) raw[c] = true;
    if (spec.keyFilter && !spec.keyFilter(c, k)) return;
    if (name || spec.extraKeys?.includes(c)) {
      e.preventDefault();
      e.stopPropagation();
      const fresh = !e.repeat;
      if (name) keys[name] = true;
      if (fresh) press(name || c, c);
    }
  }

  function onKeyUp(e) {
    const c = e.code || '';
    const k = (e.key || '').toLowerCase();
    const name = CODEMAP[c] || KEYMAP[k];
    if (c) raw[c] = false;
    if (name) {
      // Only release if no other key bound to the same action is still down.
      const still = Object.keys(CODEMAP).some((code) => CODEMAP[code] === name && raw[code]);
      if (!still) keys[name] = false;
    }
  }

  const dirName = (dx, dy) => (dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down');
  function setDir(dx, dy) { const n = dirName(dx, dy); pads[n] = true; press(n, 'pad'); }
  function release(dx, dy) { pads[dirName(dx, dy)] = false; }
  function action() { pads.action = true; press('action', 'pad'); }
  function actionUp() { pads.action = false; }

  function togglePause() {
    if (api.over) return;
    api.paused = !api.paused;
    last = performance.now();
    sfx.pause();
    hooks.onStatus(api.paused ? 'Paused' : 'Playing');
  }

  function restart() { reset(); sfx.select(); }

  function onBlur() { for (const k in keys) keys[k] = false; for (const k in raw) raw[k] = false; }
  window.addEventListener('blur', onBlur);

  reset();
  return {
    update, onKey, onKeyUp, setDir, release, action, actionUp, togglePause, restart,
    destroy() { clearTimeout(statusTimer); window.removeEventListener('blur', onBlur); },
    getScore: () => api.score,
    _debug: () => api,
  };
}
