// Old-arcade attract / start screen shared by every cart.
// A game starts "Ready": the board is drawn but frozen under a blinking PRESS START card.
// The first tap, key or pad button only starts the game (it is swallowed, so it never also turns or moves).
const FONT = '"Press Start 2P", monospace';

function fit(ctx, text, maxW, size, min = 6) {
  let s = size;
  ctx.font = `${s}px ${FONT}`;
  while (s > min && ctx.measureText(text).width > maxW) { s--; ctx.font = `${s}px ${FONT}`; }
  return s;
}

// Outlined text: stays readable over the 3D board too, where the dim box is not drawn.
function label(ctx, text, x, y, size, color) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, Math.round(size * 0.55));
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Draws the start card over whatever the game just drew. Dim box is skipped by the 3D capture; the text shows everywhere. */
export function drawStartScreen(ctx, W, H, { title = 'PIXEL NOOK', accent = '#ffd166' } = {}) {
  const now = performance.now();
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.setTransform?.(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = W / 2;
  const cy = H / 2;
  // title with a chunky drop shadow, gently bobbing like an attract mode logo
  const ts = fit(ctx, title, W * 0.88, Math.round(Math.min(W, H) / 13), 8);
  const bob = Math.round(Math.sin(now / 420) * 1.5);
  const ty = cy - H * 0.2 + bob;
  ctx.fillStyle = '#000';
  ctx.fillText(title, cx + 2, ty + 2);
  label(ctx, title, cx, ty, ts, accent);
  // thin underline bar
  ctx.fillStyle = '#ffffff';
  const bw = Math.min(W * 0.7, ctx.measureText(title).width);
  ctx.globalAlpha = 0.35;
  ctx.fillRect(cx - bw / 2, ty + ts * 0.9, bw, 1);
  ctx.globalAlpha = 1;
  // blinking prompt (on 0.6s, off 0.3s)
  if (now % 900 < 600) {
    const ps = fit(ctx, 'PRESS THE SCREEN TO START', W * 0.9, Math.max(7, Math.round(Math.min(W, H) / 36)));
    label(ctx, 'PRESS THE SCREEN TO START', cx, cy + 6, ps, '#ffffff');
  }
  const ss = fit(ctx, 'TAP / ENTER / START', W * 0.8, Math.max(6, Math.round(Math.min(W, H) / 50)));
  label(ctx, 'TAP / ENTER / START', cx, cy + 26, ss, '#c9bfa8');
  // coin line at the bottom
  const cs = fit(ctx, 'INSERT COIN ... FREE PLAY', W * 0.8, Math.max(6, Math.round(Math.min(W, H) / 54)));
  label(ctx, 'INSERT COIN ... FREE PLAY', cx, H - Math.max(16, H * 0.09), cs, '#ffd166');
  ctx.restore();
}

const NOT_START = new Set(['p', 'escape', 'r', 'c', 'b', 'f', 'tab', 'shift', 'control', 'alt', 'meta', 'capslock', 'contextmenu']);
/** True for a key press that should start a waiting game ("press any key", minus pause/restart/menu shortcuts). */
export function isStartKey(e) {
  if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = String(e.key || '').toLowerCase();
  if (!k || NOT_START.has(k) || /^f\d+$/.test(k)) return false;
  return true;
}

/**
 * Wraps a game so every input path starts it while it waits on the start screen and does nothing else.
 * The game supplies isReady() and start(); everything else is passed through untouched.
 */
export function gateStart(game) {
  if (!game || typeof game.isReady !== 'function' || typeof game.start !== 'function') return game;
  const g = Object.create(game);
  const ready = () => game.isReady();
  const startOnly = (fn) => (fn ? (...a) => { if (ready()) { game.start(); return; } return fn.apply(game, a); } : fn);
  let held = null; // the key that started the game: its auto-repeat is swallowed until it is released
  g.onKey = (e) => {
    const code = e?.code || e?.key;
    if (held && e?.repeat && code === held) { e.preventDefault?.(); return; }
    held = null;
    if (ready()) {
      if (isStartKey(e)) { e.preventDefault?.(); held = code; game.start(); return; }
      const k = String(e?.key || '').toLowerCase();
      if (k === 'p' || k === 'escape' || k === ' ' || k === 'enter') { e.preventDefault?.(); return; } // no pausing a game that hasn't begun
    }
    return game.onKey?.(e);
  };
  g.onKeyUp = (e) => {
    if (held && (e?.code || e?.key) === held) held = null;
    return game.onKeyUp?.(e);
  };
  for (const m of ['setDir', 'turnLeft', 'turnRight', 'action', 'hardDrop']) if (game[m]) g[m] = startOnly(game[m]);
  g.togglePause = (...a) => (ready() ? undefined : game.togglePause?.(...a));
  // Plain properties on the original object (e.g. functions added later) still resolve through the prototype.
  return g;
}
