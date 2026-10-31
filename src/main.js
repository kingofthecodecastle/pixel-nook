import './style.css';
import { sfx, isMuted, toggleMute, startMusic, stopMusic, resumeAudio, setRoom } from './audio.js';
import { captureCanvas } from './three/capture.js';
import { setFxWidth } from './fx.js';
import { getHighScores, nameLatest } from './storage.js';
import { INFO, PAD_COMMON, KEYS_COMMON, CAM_NOTES } from './info.js';
import {
  ACHIEVEMENTS, THEMES, SKINS, getProgress, onProgress, markPlayed, finishGame, checkDaily, dailyChallenge,
  buy, setTheme, equipSkin, applyTheme, gameName, unlock,
} from './progress.js';
import { fetchAll, fetchGame, submitScore, qualifies, localList, lastInitials, saveInitials, isOnline, cachedGame } from './online.js';
import { initGamepads } from './gamepad.js';
import { cartIcon } from './carticons.js';
import { createBackdrop, BG_LIST, BG_LABEL } from './backdrop.js';
import { createSnake } from './games/snake.js';
import { createBlockDrop } from './games/blockdrop.js';
import { createMazeMunch } from './games/mazemunch.js';
import { createStarBlaster } from './games/starblaster.js';
import { createBrickBash } from './games/brickbash.js';
import { createFrogHop } from './games/froghop.js';
import { createAsteroidDrift } from './games/asteroiddrift.js';
import { createPixelPaddle } from './games/pixelpaddle.js';
import { createLadderClimb } from './games/ladderclimb.js';
import { createNeonRacer } from './games/neonracer.js';
import { createMoonDrop } from './games/moondrop.js';
import { createTankDuel } from './games/tankduel.js';
const GAMES = {
  snake: {
    id: 'snake',
    title: 'SNAKE',
    year: "'89",
    color: '#3cb371',
    accent: '#7CFC00',
    blurb: "Grow. Don't crash. Classic.",
    factory: createSnake,
    extraLabel: null,
  },
  blockdrop: {
    id: 'blockdrop',
    title: 'BLOCK DROP',
    year: "'90",
    color: '#6c5ce7',
    accent: '#a29bfe',
    blurb: 'Stack. Clear. Speed up.',
    factory: createBlockDrop,
    extraLabel: 'LVL',
  },
  mazemunch: {
    id: 'mazemunch',
    title: 'MAZE MUNCH',
    year: "'87",
    color: '#e17055',
    accent: '#ffeaa7',
    blurb: 'Dots. Ghost. Survive.',
    factory: createMazeMunch,
    extraLabel: 'LIVES',
  },
  starblaster: {
    id: 'starblaster',
    title: 'STAR BLASTER',
    year: "'82",
    color: '#0984e3',
    accent: '#74b9ff',
    blurb: 'Blast the swarm. Hold the line.',
    factory: createStarBlaster,
    extraLabel: 'LIVES',
  },
  brickbash: {
    id: 'brickbash',
    title: 'BRICK BASH',
    year: "'86",
    color: '#d63031',
    accent: '#fab1a0',
    blurb: 'Bounce. Smash. Grab power-ups.',
    factory: createBrickBash,
    extraLabel: 'LIVES',
  },
  froghop: {
    id: 'froghop',
    title: 'FROG HOP',
    year: "'84",
    color: '#00b894',
    accent: '#55efc4',
    blurb: 'Dodge cars. Ride logs. Fill 4 homes.',
    factory: createFrogHop,
    extraLabel: 'LIVES',
  },
  asteroiddrift: {
    id: 'asteroiddrift',
    title: 'ASTEROID DRIFT',
    year: "'81",
    color: '#636e72',
    accent: '#dfe6e9',
    blurb: 'Drift. Shoot. Rocks split.',
    factory: createAsteroidDrift,
    extraLabel: 'LIVES',
  },
  pixelpaddle: {
    id: 'pixelpaddle',
    title: 'PIXEL PADDLE',
    year: "'79",
    color: '#2d3436',
    accent: '#33ff66',
    blurb: 'Table tennis. CPU or a friend.',
    factory: createPixelPaddle,
    extraLabel: 'CPU',
  },
  ladderclimb: {
    id: 'ladderclimb',
    title: 'LADDER CLIMB',
    year: "'83",
    color: '#e84393',
    accent: '#fd79a8',
    blurb: 'Climb. Jump barrels. Reach top.',
    factory: createLadderClimb,
    extraLabel: 'LIVES',
  },
  neonracer: {
    id: 'neonracer',
    title: 'NEON RACER',
    year: "'88",
    color: '#6c00b8',
    accent: '#ff2fd0',
    blurb: 'Endless road. Swerve. Go fast.',
    factory: createNeonRacer,
    extraLabel: 'LIVES',
  },
  moondrop: {
    id: 'moondrop',
    title: 'MOON DROP',
    year: "'80",
    color: '#2d3a6a',
    accent: '#fdcb6e',
    blurb: 'Easy on the throttle. Land it.',
    factory: createMoonDrop,
    extraLabel: 'LIVES',
  },
  tankduel: {
    id: 'tankduel',
    title: 'TANK DUEL',
    year: "'85",
    color: '#6b4a1e',
    accent: '#c8a165',
    blurb: 'Maze battle. Shots bounce.',
    factory: createTankDuel,
    extraLabel: 'CPU',
  },
};
const app = document.querySelector('#app');
let currentGame = null;
let currentId = null;
let raf = 0;
let keyHandler = null;
let keyUpHandler = null;
let screenFlashEl = null;
let lastStatus = 'Playing';

// —— 3D: the arcade room (menu) and the per-game 3D view load in the background; plain 2D if WebGL is missing ——
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const webgl = (() => {
  if (new URLSearchParams(location.search).get('3d') === '0') return false;
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
})();
let GV = null;       // gameview module once loaded
let room = null;     // 3D arcade room
let view = null;     // 3D view of the running cart
let backdrop = null; // animated background layer behind the board
let cap = null;      // draw-call capture of the running cart
let returnFrom = null;
let launching = false;
const threeReady = webgl
  ? Promise.all([import('./three/gameview.js'), import('./three/room.js')]).then(([gv, rm]) => {
      GV = gv;
      room = rm.createRoom(GAMES);
      if (room) {
        document.documentElement.classList.add('has3d');
        if (app.querySelector('.home')) { room.start(); room.focus(null); }
        else room.stop();
      }
    }).catch((e) => { console.warn('3D unavailable, using 2D', e); })
  : Promise.resolve();

// —— big labelled buttons: sound / info / fullscreen ——
const ICON = {
  on: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
  off: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  info: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.4" fill="none"/><path d="M12 10.5v7" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><circle cx="12" cy="6.8" r="1.7" fill="currentColor"/></svg>',
  fs: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="square"/></svg>',
  cam: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h4l2-3h6l2 3h4v12H3z" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.6" stroke="currentColor" stroke-width="2.2" fill="none"/></svg>',
  bg: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="2" stroke="currentColor" stroke-width="2.2" fill="none"/><circle cx="12" cy="12.5" r="3.4" fill="currentColor"/><path d="M3 15.5h18" stroke="currentColor" stroke-width="1.8"/></svg>',
  world: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 19l6-9 4 5 3-4 7 8z" fill="currentColor"/><circle cx="17" cy="6" r="2.6" fill="currentColor"/></svg>',
  pause: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>',
  play: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  restart: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M20 3v6h-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></svg>',
  fsx: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v6H3M21 9h-6V3M15 21v-6h6M3 15h6v6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="square"/></svg>',
};
const dockSound = () => (isMuted() ? ICON.off : ICON.on);
const CAM_SHORT = { classic: 'CLASSIC', chase: 'CHASE', fp: '1ST', arcade: 'ARCADE' };
const soundHtml = () => (isMuted() ? ICON.off + '<span>SOUND OFF</span>' : ICON.on + '<span>SOUND ON</span>');
const fsHtml = () => (isFs() ? ICON.fsx + '<span>EXIT FULL</span>' : ICON.fs + '<span>FULLSCREEN</span>');
// —— camera modes (per game) + steering preference + Snake world ——
const CAM_MODES = ['arcade', 'classic', 'chase', 'fp']; // C / LB cycle order; ARCADE is the default
const STEER_GAMES = new Set(['snake', 'mazemunch']);
const CAM_LABEL = { classic: 'CLASSIC', chase: 'CHASE', fp: 'FIRST PERSON', arcade: 'ARCADE' };
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const camOf = (id) => { const m = lsGet('pixelnook_cam_' + id, 'arcade'); return CAM_MODES.includes(m) ? m : 'arcade'; };
const steerPref = () => (lsGet('pixelnook_steer', 'relative') === 'absolute' ? 'absolute' : 'relative');
const worldOf = (id) => (id === 'snake' && lsGet('pixelnook_world_snake', 'neon') === 'fantasy' ? 'fantasy' : 'neon');
const camHtml = (m) => `${ICON.cam}<span><i class="cam-k">CAMERA · </i>${CAM_LABEL[m]}</span><kbd class="key-cap" aria-hidden="true">C</kbd>`;
const worldHtml = (w) => `${ICON.world}<span>WORLD: ${w === 'fantasy' ? 'FANTASY' : 'CLASSIC NEON'}</span>`;
function applyCam() {
  if (!currentId) return;
  const m = camOf(currentId);
  view?.setCamMode?.(m);
  // ARCADE shows the classic board on a cabinet screen, so the cart plays exactly like classic
  currentGame?.setCam?.(m === 'arcade' ? 'classic' : m);
  if (m === 'arcade' && view?.arcadeOwnsPointer?.() && lsGet('pixelnook_arcade_drag_hint_seen', '') !== '1') {
    lsSet('pixelnook_arcade_drag_hint_seen', '1');
    const frame = app.querySelector('#playFrame');
    const hint = document.createElement('div');
    hint.className = 'cam-banner drag-hint';
    hint.textContent = 'DRAG TO LOOK AROUND';
    setTimeout(() => frame?.appendChild(hint), 1300);
    setTimeout(() => hint.classList.add('out'), 3500);
    setTimeout(() => hint.remove(), 4000);
  }
  currentGame?.setRelative?.(m !== 'classic' && m !== 'arcade' && steerPref() === 'relative');
  const b = app.querySelector('#camBtn');
  const dl = app.querySelector('#dockCamLbl'); if (dl) dl.textContent = CAM_SHORT[m];
  if (b) { b.innerHTML = camHtml(m); b.title = `Camera: ${CAM_LABEL[m].toLowerCase()} (C or LB to switch)`; b.dataset.mode = m; }
}
function cycleCam() {
  if (!currentId || !view) return;
  const m = camOf(currentId);
  const next = CAM_MODES[(CAM_MODES.indexOf(m) + 1) % CAM_MODES.length];
  lsSet('pixelnook_cam_' + currentId, next);
  app.querySelectorAll('.cam-hint').forEach((el) => el.classList.remove('cam-hint'));
  sfx.click();
  applyCam();
  toast('Camera: ' + CAM_LABEL[next], '', 'cam');
}
// —— animated background behind the board (global, all carts) ——
const bgOf = () => { const b = lsGet('pixelnook_bg', 'sunset'); return BG_LIST.includes(b) ? b : 'sunset'; };
const bgHtml = (b) => `${ICON.bg}<span><i class="cam-k">BG · </i>${BG_LABEL[b]}</span><kbd class="key-cap" aria-hidden="true">B</kbd>`;
function applyBg() {
  const b = bgOf();
  backdrop?.set(b);
  view?.setBackdrop?.(b !== 'off');
  const btn = app.querySelector('#bgBtn');
  if (btn) { btn.innerHTML = bgHtml(b); btn.title = `Background: ${BG_LABEL[b].toLowerCase()} (B to switch)`; btn.dataset.bg = b; }
  const dl = app.querySelector('#dockBgLbl'); if (dl) dl.textContent = BG_LABEL[b];
}
function cycleBg() {
  if (!currentId) return;
  const next = BG_LIST[(BG_LIST.indexOf(bgOf()) + 1) % BG_LIST.length];
  lsSet('pixelnook_bg', next);
  sfx.click();
  applyBg();
  toast('Background: ' + BG_LABEL[next], '', 'bg');
}
function setWorldUi(w) { const b = app.querySelector('#worldBtn'); if (b) { b.innerHTML = worldHtml(w); b.dataset.world = w; } }
async function toggleWorld() {
  if (currentId !== 'snake' || !view?.setWorld) return;
  const next = worldOf('snake') === 'fantasy' ? 'neon' : 'fantasy';
  lsSet('pixelnook_world_snake', next);
  sfx.click();
  setWorldUi(next);
  const b = app.querySelector('#worldBtn'); if (b && next === 'fantasy') b.classList.add('loading');
  try { await view.setWorld(next); } catch (e) { console.warn('world failed', e); }
  b?.classList.remove('loading');
}

function refreshButtons() {
  app.querySelectorAll('.mute-btn').forEach((b) => { b.innerHTML = soundHtml(); b.setAttribute('aria-pressed', String(!isMuted())); b.title = isMuted() ? 'Sound is off: click to turn on' : 'Sound is on: click to mute'; });
  app.querySelectorAll('.dock-mute').forEach((b) => { b.innerHTML = dockSound(); b.setAttribute('aria-pressed', String(!isMuted())); b.title = isMuted() ? 'Sound off (click to turn on)' : 'Sound on (click to mute)'; });
  app.querySelectorAll('.fs-btn').forEach((b) => { b.innerHTML = fsHtml(); b.setAttribute('aria-pressed', String(isFs())); b.title = isFs() ? 'Exit fullscreen (F / Esc)' : 'Fullscreen (F)'; });
}

// —— fullscreen: real Fullscreen API where allowed, otherwise a pseudo-fullscreen that fills the viewport (iPhone Safari, gamepad presses) ——
const rootEl = document.documentElement;
const nativeFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const isFs = () => nativeFs() || rootEl.classList.contains('pseudo-fs');
function setPseudoFs(on) {
  rootEl.classList.toggle('pseudo-fs', on);
  fsChanged();
}
function fsChanged() {
  rootEl.classList.toggle('is-fs', isFs());
  app.querySelector('.canvas-wrap')?.classList.remove('dock-reserve');
  refreshButtons();
  requestAnimationFrame(() => { fitCanvas(); view?.resize?.(); requestAnimationFrame(placeDock); });
}
function enterFs() {
  const req = rootEl.requestFullscreen || rootEl.webkitRequestFullscreen;
  const can = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (!req || !can) return setPseudoFs(true);
  try {
    const r = req.call(rootEl, { navigationUI: 'hide' });
    if (r && r.catch) r.catch(() => setPseudoFs(true)); // e.g. no user activation (gamepad)
  } catch (_) { setPseudoFs(true); }
}
function exitFs() {
  if (rootEl.classList.contains('pseudo-fs')) setPseudoFs(false);
  if (nativeFs()) { const ex = document.exitFullscreen || document.webkitExitFullscreen; try { const r = ex?.call(document); r?.catch?.(() => {}); } catch (_) {} }
}
function toggleFullscreen() { sfx.click(); if (isFs()) exitFs(); else enterFs(); }
document.addEventListener('fullscreenchange', fsChanged);
document.addEventListener('webkitfullscreenchange', fsChanged);
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (document.querySelector('.ini-panel')) return; // typing initials
  if (e.code === 'KeyF' && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); toggleFullscreen(); }
  else if (e.code === 'KeyC' && !e.repeat && currentGame && !modalEl) { e.preventDefault(); e.stopImmediatePropagation(); cycleCam(); }
  else if (e.code === 'KeyB' && !e.repeat && currentGame && !modalEl) { e.preventDefault(); e.stopImmediatePropagation(); cycleBg(); }
  else if (e.code === 'Escape' && rootEl.classList.contains('pseudo-fs') && !modalEl) { setPseudoFs(false); }
}, { capture: true });

// —— in-game canvas fit: largest size that keeps the aspect ratio ——
const wideLayout = () => matchMedia('(min-width: 900px) and (min-height: 480px)').matches;
function fitCanvas() {
  const wrap = app.querySelector('.canvas-wrap'), c = app.querySelector('#gameCanvas');
  if (!wrap || !c || !c.width || !c.height) return;
  const cs = getComputedStyle(wrap);
  const aw = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 6;
  let ah;
  if (wideLayout() || isFs()) ah = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 6;
  else ah = Math.max(220, innerHeight * (isFs() ? 0.66 : 0.6));
  const s = Math.max(0.5, Math.min(aw / c.width, ah / c.height));
  const w = Math.floor(c.width * s), h = Math.floor(c.height * s);
  if (c.style.width !== w + 'px' || c.style.height !== h + 'px') { c.style.width = w + 'px'; c.style.height = h + 'px'; }
}
// —— fullscreen dock: sits just outside the board's bottom-right corner when there is room, else tucked inside it ——
function placeDock() {
  const dock = app.querySelector('#fsDock'), wrap = app.querySelector('.canvas-wrap');
  if (!dock || !wrap || !isFs()) return;
  const W = wrap.clientWidth, H = wrap.clientHeight, g = 8;
  const wr = wrap.getBoundingClientRect();
  let r = null;
  const gl = view?.canvas, br = view?.boardRect?.();
  if (gl && br) { const o = gl.getBoundingClientRect(); r = { left: o.left - wr.left + br.left, right: o.left - wr.left + br.right, top: o.top - wr.top + br.top, bottom: o.top - wr.top + br.bottom }; }
  else { const c = app.querySelector('#gameCanvas').getBoundingClientRect(); r = { left: c.left - wr.left, right: c.right - wr.left, top: c.top - wr.top, bottom: c.bottom - wr.top }; }
  const R = Math.min(r.right, W - g), B = Math.min(r.bottom, H - g);
  // try the slim vertical dock beside the board first, then a row below it, else tucked inside the corner
  dock.dataset.where = 'side';
  let dw = dock.offsetWidth, dh = dock.offsetHeight, x, y, where;
  if (W - r.right >= dw + g * 2 && dh + g * 2 <= H) { x = r.right + g; y = B - dh; where = 'side'; }
  else {
    dock.dataset.where = 'below'; dw = dock.offsetWidth; dh = dock.offsetHeight;
    if (H - r.bottom >= dh + g * 2) { x = R - dw; y = r.bottom + g; where = 'below'; }
    else if (!wrap.classList.contains('dock-reserve')) {
      // board fills the stage both ways: reserve a slim band under it for the dock instead of covering the board
      wrap.style.setProperty('--dock-h', (dh + g * 2 + 2) + 'px');
      wrap.classList.add('dock-reserve');
      requestAnimationFrame(() => { fitCanvas(); view?.resize?.(); requestAnimationFrame(placeDock); });
      x = R - dw; y = H - dh - g; where = 'below';
    } else { x = R - dw - g; y = B - dh - g; where = 'inside'; }
  }
  x = Math.max(g, Math.min(W - dw - g, x)); y = Math.max(g, Math.min(H - dh - g, y));
  dock.style.left = Math.round(x) + 'px'; dock.style.top = Math.round(y) + 'px'; dock.dataset.where = where;
}
setInterval(() => { if (isFs() && currentGame) placeDock(); }, 250);
let fitRO = null;
window.addEventListener('resize', () => { app.querySelector('.canvas-wrap')?.classList.remove('dock-reserve'); fitCanvas(); });

/** Menu -> game: camera flies into the cabinet, then the cart boots. */
async function launch(id) {
  if (launching) return;
  launching = true;
  sfx.whoosh();
  app.querySelector('.home')?.classList.add('leaving');
  try {
    await Promise.race([threeReady, sleep(2500)]);
    if (room?.running && !reduceMotion) await Promise.race([room.flyTo(id, 0.6), sleep(900)]);
  } finally { launching = false; }
  startGame(id);
}

const CRT_KEY = 'pixelnook_crt';
const isCrt = () => localStorage.getItem(CRT_KEY) === '1';
function applyCrt() { document.documentElement.classList.toggle('crt', isCrt()); }
applyTheme();
applyCrt();

function esc(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// —— high-score lists (online first, local fallback) ——
function rows(list, limit, mark = -1) {
  if (!list || !list.length) return '<li class="empty">— no scores yet —</li>';
  return list.slice(0, limit).map((e, i) =>
    `<li${i === mark ? ' class="me"' : ''}><span class="rank">${i + 1}</span><span class="nm">${esc(e.name || 'YOU')}</span><span class="pts">${e.score}</span></li>`).join('');
}
function hsList(id) { const o = cachedGame(id); return rows(o && o.length ? o : localList(id), 5); }

// —— toasts ——
let toastWrap = null;
const keyedToasts = new Map(); // key -> live toast element, reused so quick repeats (camera / BG) don't stack
function toast(html, kind = '', key = '') {
  if (!toastWrap) { toastWrap = document.createElement('div'); toastWrap.className = 'toasts'; document.body.appendChild(toastWrap); }
  let t = key ? keyedToasts.get(key) : null;
  if (t && t.isConnected) { clearTimeout(t._out); clearTimeout(t._rm); t.classList.remove('out'); }
  else {
    t = document.createElement('div');
    toastWrap.appendChild(t);
    if (key) keyedToasts.set(key, t);
  }
  t.className = 'toast ' + kind;
  t.innerHTML = html;
  while (toastWrap.children.length > 4) toastWrap.firstChild.remove();
  t._out = setTimeout(() => t.classList.add('out'), 2600);
  t._rm = setTimeout(() => { t.remove(); if (key && keyedToasts.get(key) === t) keyedToasts.delete(key); }, 3100);
}
onProgress((e) => {
  if (e.type === 'coins' && e.why === 'game') { toast(`+${e.n} 🪙`, 'coin'); sfx.coin(); }
  if (e.type === 'achievement') { toast(`⭐ BADGE: ${esc(e.a.name)} <small>+25 🪙</small>`, 'ach'); sfx.achieve(); }
  if (e.type === 'daily') { toast(`★ DAILY CHALLENGE COMPLETE! <small>+${e.d.reward} 🪙</small>`, 'daily'); sfx.level(); }
  const c = document.querySelector('#coinCount');
  if (c) c.textContent = String(getProgress().coins);
});

// Unlock audio (and the menu music) on the first real gesture
const unlockAudio = () => resumeAudio();
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });
for (const ev of ['click', 'pointerup', 'mouseup', 'touchend']) window.addEventListener(ev, unlockAudio, { capture: true });

function renderHome() {
  teardownGame();
  setRoom(true);
  if (room) { room.start(); room.focus(null); if (returnFrom && !reduceMotion) room.pullBack(returnFrom); }
  returnFrom = null;
  const d = dailyChallenge();
  const P = getProgress();
  const achDone = ACHIEVEMENTS.filter((a) => P.ach[a.id]).length;
  app.innerHTML = `
    <div class="crt-frame home">
      <div class="scanlines"></div>
      <header class="brand">
        <div class="logo-mark" aria-hidden="true">▣</div>
        <h1>PIXEL NOOK</h1>
        <p class="tagline">Swap a cart. Play like it's 1989.</p>
      </header>
      <div class="meta-row">
        <p class="select-label">SELECT CARTRIDGE</p>
        <button type="button" class="daily${d.done ? ' done' : ''}" id="dailyBtn" style="--accent:${GAMES[d.game].accent}" title="Daily challenge – the same for everyone today">
          <span class="daily-k">★ DAILY</span><span class="daily-l">${esc(d.label)}</span><span class="daily-r">${d.done ? '✔ DONE' : `+${d.reward} 🪙`}</span>
        </button>
      </div>
      <div class="cart-row" role="list">
        ${Object.values(GAMES).map((g) => `
          <button class="cart${g.id === d.game ? ' is-daily' : ''}" data-game="${g.id}" role="listitem" style="--cart:${g.color};--accent:${g.accent}">
            <div class="cart-ridge"></div>
            <span class="cart-icon-wrap">${cartIcon(g.id)}</span>
            ${g.id === d.game ? '<span class="cart-daily" title="Daily challenge">★</span>' : ''}
            <span class="cart-info" data-info="${g.id}" role="button" tabindex="0" aria-label="Game info: ${g.title}" title="Game info">i</span>
            <div class="cart-label">
              <span class="cart-year">${g.year}</span>
              <span class="cart-title">${g.title}</span>
              <span class="cart-blurb">${g.blurb}</span>
            </div>
            <div class="cart-chip"></div>
            <ol class="cart-hs" data-hs="${g.id}">${hsList(g.id)}</ol>
          </button>
        `).join('')}
      </div>
      <footer class="home-foot">
        <div class="foot-btns">
          <button type="button" class="btn chunky big-btn mute-btn" id="muteBtn">${soundHtml()}</button>
          <button type="button" class="btn chunky big-btn fs-btn" id="fsBtn">${fsHtml()}</button>
          <button type="button" class="btn chunky small" id="boardBtn">🏆 LEADERBOARD</button>
          <button type="button" class="btn chunky small" id="shopBtn">🛒 SHOP</button>
          <button type="button" class="btn chunky small" id="achBtn">⭐ ${achDone}/${ACHIEVEMENTS.length}</button>
          <button type="button" class="btn chunky small${isCrt() ? ' on' : ''}" id="crtBtn" aria-pressed="${isCrt()}">📺 CRT ${isCrt() ? 'ON' : 'OFF'}</button>
          <span class="coins" title="Coins">🪙 <span id="coinCount">${P.coins}</span></span>
        </div>
        <p class="hint">Arrows / WASD · Space fire/jump · P pause · R restart · F fullscreen · C camera · 🎮 gamepad <span id="netState"></span></p>
      </footer>
    </div>
  `;

  app.querySelectorAll('.cart-info').forEach((el) => {
    const open = (e) => { e.preventDefault(); e.stopPropagation(); sfx.click(); openInfo(el.dataset.info); };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
  });
  app.querySelectorAll('.cart').forEach((btn) => {
    btn.addEventListener('click', () => { sfx.select(); launch(btn.dataset.game); });
    btn.addEventListener('mouseenter', () => room?.focus(btn.dataset.game));
    btn.addEventListener('focus', () => room?.focus(btn.dataset.game));
    btn.addEventListener('mouseleave', () => room?.focus(null));
  });
  app.querySelector('#dailyBtn').addEventListener('click', () => { sfx.select(); launch(d.game); });
  app.querySelector('#muteBtn').addEventListener('click', () => { toggleMute(); sfx.click(); renderHome(); });
  app.querySelector('#fsBtn').addEventListener('click', (e) => { e.currentTarget.blur(); toggleFullscreen(); });
  app.querySelector('#boardBtn').addEventListener('click', () => { sfx.click(); openBoard(d.game); });
  app.querySelector('#shopBtn').addEventListener('click', () => { sfx.click(); openShop(); });
  app.querySelector('#achBtn').addEventListener('click', () => { sfx.click(); openAchievements(); });
  app.querySelector('#crtBtn').addEventListener('click', () => {
    localStorage.setItem(CRT_KEY, isCrt() ? '0' : '1');
    applyCrt(); sfx.click(); renderHome();
    app.querySelector('#crtBtn')?.focus({ preventScroll: true });
  });

  startMusic();
  fetchAll().then((scores) => {
    const net = app.querySelector('#netState');
    if (net) net.textContent = scores ? '· 🌐 online leaderboard' : '· offline – local leaderboard';
    if (!scores) return;
    app.querySelectorAll('.cart-hs[data-hs]').forEach((ol) => {
      ol.innerHTML = rows(scores[ol.dataset.hs]?.length ? scores[ol.dataset.hs] : localList(ol.dataset.hs), 5);
      ol.classList.toggle('online', !!scores[ol.dataset.hs]?.length);
    });
  });
}

function startGame(id) {
  const meta = GAMES[id];
  if (!meta) return;
  teardownGame();
  stopMusic(true);
  room?.stop();
  setRoom(false);
  currentId = id;
  markPlayed(id);

  app.innerHTML = `
    <div class="crt-frame play" id="playFrame">
      <div class="scanlines"></div>
      <div class="screen-flash" id="screenFlash"></div>
      <header class="play-bar">
        <button type="button" class="btn chunky small" id="backBtn">◀ CABINET</button>
        <div class="play-title" style="color:${meta.accent}">${meta.title}</div>
        <div class="bar-right">
          <button type="button" class="btn chunky big-btn info-btn" id="infoBtn" aria-label="Game info" title="How to play (Y on gamepad)">${ICON.info}<span>INFO</span></button>
          <button type="button" class="btn chunky big-btn mute-btn" id="muteBtn">${soundHtml()}</button>
          <button type="button" class="btn chunky big-btn cam-btn" id="camBtn">${camHtml(camOf(id))}</button>
          <button type="button" class="btn chunky big-btn bg-btn" id="bgBtn">${bgHtml(bgOf())}</button>
          <button type="button" class="btn chunky big-btn fs-btn" id="fsBtn">${fsHtml()}</button>
        </div>
      </header>
      <div class="hud">
        <div class="hud-item"><span class="lbl">SCORE</span><span id="scoreEl">0</span></div>
        <div class="hud-item" id="extraWrap" style="display:none"><span class="lbl" id="extraLbl"></span><span id="extraEl"></span></div>
        <div class="hud-item"><span class="lbl">STATUS</span><span id="statusEl">Playing</span></div>
      </div>
      <div class="canvas-wrap">
        <div class="screen"><canvas id="gameCanvas"></canvas></div>
        <div class="fs-dock" id="fsDock" aria-label="Fullscreen controls">
          <span class="fs-score" title="Score"><i>SCORE</i> <b id="fsScore">0</b></span>
          <button type="button" class="btn chunky dock-btn" id="dockPause" title="Pause / resume (P)">${ICON.pause}</button>
          <button type="button" class="btn chunky dock-btn" id="dockRestart" title="Restart (R)">${ICON.restart}</button>
          <button type="button" class="btn chunky dock-btn dock-mute" id="dockMute">${dockSound()}</button>
          <button type="button" class="btn chunky dock-btn dock-cam" id="dockCam" title="Camera (C)">${ICON.cam}<span id="dockCamLbl">${CAM_SHORT[camOf(id)]}</span><kbd class="key-cap" aria-hidden="true">C</kbd></button>
          <button type="button" class="btn chunky dock-btn dock-bg" id="dockBg" title="Background (B)">${ICON.bg}<span id="dockBgLbl">${BG_LABEL[bgOf()]}</span><kbd class="key-cap" aria-hidden="true">B</kbd></button>
          <button type="button" class="btn chunky dock-btn dock-exit" id="dockExit" title="Exit fullscreen (F / Esc)">${ICON.fsx}<span>EXIT</span></button>
        </div>
      </div>
      <div class="play-actions">
        <button type="button" class="btn chunky small" id="pauseBtn">PAUSE</button>
        <button type="button" class="btn chunky small" id="restartBtn">RESTART</button>
        ${id === 'snake' ? `<button type="button" class="btn chunky small world-btn" id="worldBtn" title="Switch world: classic neon or the fantasy cliff">${worldHtml(worldOf(id))}</button>` : ''}
      </div>
      <div class="touch-pad" aria-label="Touch controls">
        <div class="dpad">
          <button type="button" class="pad-btn" data-dx="0" data-dy="-1">▲</button>
          <div class="dpad-mid">
            <button type="button" class="pad-btn" data-dx="-1" data-dy="0">◀</button>
            <button type="button" class="pad-btn action" id="actionBtn">●</button>
            <button type="button" class="pad-btn" data-dx="1" data-dy="0">▶</button>
          </div>
          <button type="button" class="pad-btn" data-dx="0" data-dy="1">▼</button>
        </div>
      </div>
      <div class="hs-panel">
        <p class="hs-title" id="hsTitle">LEADERBOARD</p>
        <ol id="hsLive">${hsList(id)}</ol>
      </div>
    </div>
  `;

  screenFlashEl = app.querySelector('#screenFlash');
  try { backdrop = createBackdrop(app.querySelector('#playFrame'), () => ({ board: app.querySelector('.screen'), stage: app.querySelector('.canvas-wrap') })); } catch (e) { console.warn('backdrop failed', e); backdrop = null; }
  const canvas = app.querySelector('#gameCanvas');
  cap = captureCanvas(canvas);
  const noSaveNow = () => !!currentGame?._debug?.()?.noSave;
  const showBoard = (mark = -1) => {
    const hs = app.querySelector('#hsLive'), title = app.querySelector('#hsTitle');
    if (!hs) return;
    const online = cachedGame(id);
    const has = online && online.length;
    title.textContent = has ? '🌐 TOP 10' : online ? '🌐 TOP 10 · empty – local:' : 'TOP 5 · LOCAL';
    const list = has ? online : localList(id);
    hs.innerHTML = rows(list, has ? 10 : 5, mark);
    view?.setArcadeScores?.({ best: +(list?.[0]?.score) || 0 }); // read-only: ARCADE CRT header
  };
  fetchGame(id).then(() => { if (currentId === id) showBoard(); });

  const hooks = {
    onScore(s) {
      const el = app.querySelector('#scoreEl');
      if (el) el.textContent = String(s);
      view?.setArcadeScores?.({ score: s });
      const fe = app.querySelector('#fsScore'); if (fe) fe.textContent = String(s);
      if (s > 0) checkDaily(id, s, noSaveNow());
    },
    onStatus(t) {
      lastStatus = t;
      const el = app.querySelector('#statusEl');
      if (el) el.textContent = t;
      const dp = app.querySelector('#dockPause'); if (dp) { const pz = t === 'Paused'; dp.innerHTML = pz ? ICON.play : ICON.pause; dp.setAttribute('aria-label', pz ? 'Resume' : 'Pause'); }
    },
    onExtra(data) {
      const wrap = app.querySelector('#extraWrap');
      const lbl = app.querySelector('#extraLbl');
      const el = app.querySelector('#extraEl');
      if (!wrap) return;
      if (data.level != null) {
        wrap.style.display = '';
        lbl.textContent = 'LVL';
        el.textContent = `${data.level} · L${data.lines}`;
      } else if (data.lives != null) {
        wrap.style.display = '';
        lbl.textContent = 'LIVES';
        el.textContent = '❤'.repeat(Math.max(0, data.lives)) || '0';
      } else if (data.label != null) {
        wrap.style.display = '';
        lbl.textContent = data.label;
        el.textContent = String(data.value);
      }
    },
    onFlash(kind) {
      view?.flash(kind);
      if (!screenFlashEl) return;
      screenFlashEl.className = 'screen-flash show ' + kind;
      clearTimeout(screenFlashEl._t);
      screenFlashEl._t = setTimeout(() => { screenFlashEl.className = 'screen-flash'; }, 180);
    },
    onGameOver(score, _list, opts = {}) {
      const noSave = !!opts.noSave;
      checkDaily(id, score, noSave);
      finishGame(id, score, { noSave });
      showBoard();
      if (noSave || score <= 0) return;
      const game = currentGame;
      setTimeout(() => {
        if (currentGame !== game || modalEl || lastStatus !== 'Game Over') return;
        if (isOnline() === false || qualifies(id, score)) openInitials(id, score, showBoard);
        else { nameLatest(id, score, lastInitials()); showBoard(); toast('Not top 10 this time – try again!'); }
      }, 1100);
    },
  };

  lastStatus = 'Playing';
  currentGame = meta.factory(canvas, hooks);
  cap.W = canvas.width; cap.H = canvas.height;
  fitCanvas();
  fitRO?.disconnect();
  if (window.ResizeObserver) { fitRO = new ResizeObserver(() => fitCanvas()); fitRO.observe(app.querySelector('.canvas-wrap')); }
  setFxWidth(canvas.width);
  const screenEl = app.querySelector('.screen');
  try { view = GV ? GV.createGameView(screenEl, cap, id, meta.accent, meta.title) : null; } catch (e) { console.warn('3D view failed, using 2D', e); view = null; }
  cap.mode3d = !!view;
  if (view) {
    view.setAvatar?.(() => currentGame?.avatar?.());
    view.setState?.(() => currentGame?.state?.());
    if (worldOf(id) === 'fantasy') view.setWorld?.('fantasy').catch?.((e) => console.warn('world failed', e));
    screenEl.classList.add('is3d');
    view.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      const v = view; view = null; if (cap) cap.mode3d = false;
      screenEl.classList.remove('is3d');
      setTimeout(() => v?.dispose(), 0);
    });
  }

  keyHandler = (e) => { if (modalEl) return; currentGame?.onKey?.(e); };
  // capture:true so Arrow keys aren't lost when a button has focus (macOS Chrome)
  window.addEventListener('keydown', keyHandler, { capture: true });
  // Held-input games (Cabinet 2) also listen for key releases
  keyUpHandler = (e) => currentGame?.onKeyUp?.(e);
  window.addEventListener('keyup', keyUpHandler, { capture: true });

  app.querySelector('#backBtn').addEventListener('click', async () => {
    sfx.whooshOut();
    if (view && !reduceMotion) await Promise.race([view.outro(), sleep(450)]);
    if (currentId === id) renderHome();
  });
  app.querySelector('#muteBtn').addEventListener('click', () => {
    toggleMute();
    refreshButtons();
    sfx.click();
  });
  app.querySelector('#infoBtn').addEventListener('click', (e) => { e.currentTarget.blur(); sfx.click(); openInfo(id); });
  app.querySelector('#fsBtn').addEventListener('click', (e) => { e.currentTarget.blur(); toggleFullscreen(); });
  app.querySelector('#camBtn').addEventListener('click', (e) => { e.currentTarget.blur(); cycleCam(); });
  app.querySelector('#worldBtn')?.addEventListener('click', (e) => { e.currentTarget.blur(); toggleWorld(); });
  if (!view) { app.querySelector('#camBtn').hidden = true; app.querySelector('#worldBtn')?.setAttribute('hidden', ''); }
  applyCam();
  app.querySelector('#bgBtn').addEventListener('click', (e) => { e.currentTarget.blur(); cycleBg(); });
  app.querySelector('#dockBg').addEventListener('click', (e) => { e.currentTarget.blur(); cycleBg(); });
  applyBg();
  app.querySelector('#pauseBtn').addEventListener('click', () => currentGame?.togglePause());
  app.querySelector('#dockPause').addEventListener('click', (e) => { e.currentTarget.blur(); currentGame?.togglePause(); });
  app.querySelector('#dockRestart').addEventListener('click', (e) => { e.currentTarget.blur(); currentGame?.restart(); showBoard(); });
  app.querySelector('#dockMute').addEventListener('click', (e) => { e.currentTarget.blur(); toggleMute(); refreshButtons(); sfx.click(); });
  app.querySelector('#dockCam').addEventListener('click', (e) => { e.currentTarget.blur(); cycleCam(); });
  app.querySelector('#dockExit').addEventListener('click', (e) => { e.currentTarget.blur(); toggleFullscreen(); });
  if (!view) app.querySelector('#dockCam').hidden = true;
  // make the camera shortcut obvious: a big 'SWITCH CAMERA = C' banner on the board for a few seconds,
  // shown once ever (seen in one cart = not shown again)
  if (view && lsGet('pixelnook_cam_hint_seen', '') !== '1') {
    lsSet('pixelnook_cam_hint_seen', '1');
    const frame = app.querySelector('#playFrame');
    const hint = document.createElement('div');
    hint.className = 'cam-banner';
    hint.innerHTML = 'SWITCH CAMERA = <kbd class="key-cap">C</kbd>';
    setTimeout(() => frame?.appendChild(hint), 600);
    setTimeout(() => hint.classList.add('out'), 2600);
    setTimeout(() => hint.remove(), 3100);
  }
  app.querySelector('#restartBtn').addEventListener('click', () => { currentGame?.restart(); showBoard(); });
  // ARCADE cabinet: its PAUSE / RESTART buttons do exactly what the side-panel buttons do; a plain click = the cart's tap
  view?.setArcadeHandlers?.({
    button: (b) => { if (b === 'pause') currentGame?.togglePause(); else if (b === 'restart') { currentGame?.restart(); showBoard(); } },
    tap: () => { if (id === 'snake' || id === 'blockdrop') currentGame?.turnLeft?.(); },
  });
  view?.setArcadeScores?.({ score: 0 });
  showBoard();

  app.querySelectorAll('.pad-btn[data-dx]').forEach((btn) => {
    const fire = (e) => { e.preventDefault(); currentGame?.setDir(+btn.dataset.dx, +btn.dataset.dy); };
    btn.addEventListener('pointerdown', fire);
    // Release for held-input games (no-op for the original three carts)
    const rel = () => currentGame?.release?.(+btn.dataset.dx, +btn.dataset.dy);
    btn.addEventListener('pointerup', rel);
    btn.addEventListener('pointercancel', rel);
    btn.addEventListener('pointerleave', rel);
  });

  // Tap/click anywhere (not on UI buttons):
  // Snake = one left turn; Block Drop = one rotate (same gesture)
  if (id === 'snake' || id === 'blockdrop') {
    const playFrame = app.querySelector('#playFrame');
    const onTap = (e) => {
      if (e.target.closest('button')) return;
      if (view?.arcadeOwnsPointer?.() && screenEl.contains(e.target)) return; // ARCADE: short click handled by the cabinet view
      e.preventDefault();
      currentGame?.turnLeft?.();
    };
    playFrame?.addEventListener('pointerdown', onTap);
    // Also bind canvas directly (some browsers focus quirks)
    canvas.addEventListener('pointerdown', onTap);
  }
  const act = app.querySelector('#actionBtn');
  act.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (currentGame?.hardDrop) currentGame.hardDrop();
    else if (currentGame?.action) currentGame.action();
  });
  const actUp = () => currentGame?.actionUp?.();
  act.addEventListener('pointerup', actUp);
  act.addEventListener('pointercancel', actUp);
  act.addEventListener('pointerleave', actUp);

  const loop = (now) => {
    cap?.begin();
    currentGame?.update(now);
    view?.render(now);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function teardownGame() {
  closeModal(false);
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (keyHandler) window.removeEventListener('keydown', keyHandler, { capture: true });
  keyHandler = null;
  if (keyUpHandler) window.removeEventListener('keyup', keyUpHandler, { capture: true });
  keyUpHandler = null;
  currentGame?.destroy?.();
  fitRO?.disconnect(); fitRO = null;
  currentGame = null;
  if (currentId) returnFrom = currentId;
  currentId = null;
  view?.dispose();
  view = null;
  backdrop?.destroy();
  backdrop = null;
  cap = null;
}

// —— Modal chassis (info, leaderboard, shop, achievements, initials) ——
let modalEl = null;
let modalKey = null;
let modalCfg = null;
let pausedByModal = false;

function openModal(inner, cfg = {}) {
  closeModal(false);
  modalCfg = cfg;
  pausedByModal = false;
  if (cfg.pause && currentGame && lastStatus !== 'Paused' && lastStatus !== 'Game Over') {
    currentGame.togglePause?.();
    pausedByModal = lastStatus === 'Paused';
  }
  modalEl = document.createElement('div');
  modalEl.className = 'info-overlay';
  modalEl.innerHTML = `
    <div class="info-panel ${cfg.cls || ''}" role="dialog" aria-modal="true" aria-label="${esc(cfg.label || '')}" style="--accent:${cfg.accent || '#ffeaa7'}">
      <button type="button" class="info-close" aria-label="Lukk">✕</button>
      <div class="modal-inner">${inner}</div>
    </div>`;
  document.body.appendChild(modalEl);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(true); });
  modalEl.querySelector('.info-close').addEventListener('click', () => closeModal(true));
  modalKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || e.code === 'Escape') { e.preventDefault(); closeModal(true); return; }
    if (cfg.onKey && cfg.onKey(e)) { e.preventDefault(); return; }
    if (e.key === 'Enter' || e.key === ' ') return; // activate focused button
    if (e.key !== 'Tab') e.preventDefault();
  };
  window.addEventListener('keydown', modalKey, { capture: true });
  (modalEl.querySelector(cfg.focus || '.info-close') || modalEl.querySelector('.info-close')).focus({ preventScroll: true });
  return modalEl;
}
function setModalInner(html) { if (modalEl) modalEl.querySelector('.modal-inner').innerHTML = html; }

function closeModal(resume) {
  if (!modalEl) return;
  const cfg = modalCfg;
  modalEl.remove();
  modalEl = null;
  modalCfg = null;
  window.removeEventListener('keydown', modalKey, { capture: true });
  modalKey = null;
  if (resume && pausedByModal && currentGame && lastStatus === 'Paused') currentGame.togglePause?.();
  pausedByModal = false;
  if (resume) sfx.click();
  cfg?.onClose?.();
}

// —— Game info overlay ——
function openInfo(id) {
  const meta = GAMES[id], info = INFO[id];
  if (!meta || !info) return;
  const willPause = !!currentGame && lastStatus !== 'Paused' && lastStatus !== 'Game Over';
  const list = (arr) => `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  openModal(`
      <p class="info-kicker">GAME INFO</p>
      <h2 class="info-title">${esc(meta.title)}</h2>
      <div class="info-body">
        <h3>GOAL</h3><p>${esc(info.goal)}</p>
        <h3>KEYBOARD</h3>${list([...info.keys, ...KEYS_COMMON])}
        <h3>TOUCH</h3>${list(info.touch)}
        <h3>GAMEPAD</h3>${list([...(info.pad || []), ...PAD_COMMON])}
        <h3>RULES &amp; HAZARDS</h3>${list(info.rules)}
        <h3>CAMERA (C / LB)</h3>${list([...(CAM_NOTES[id] || []), 'ARCADE: the game runs on the screen of a 3D arcade cabinet. Controls are the same as CLASSIC.'])}
        <p class="cam-now">Now: <b id="camNow">${CAM_LABEL[camOf(id)]}</b>${STEER_GAMES.has(id) ? ` · <button type="button" class="btn chunky small" id="steerBtn">STEERING: ${steerPref().toUpperCase()}</button>` : ''}</p>
      </div>
      <p class="info-foot">${currentGame ? (willPause || lastStatus === 'Paused' ? 'Game paused · ' : '') : ''}X / Esc / tap outside to close</p>`,
  { pause: true, accent: meta.accent, label: 'Game info: ' + meta.title });
  modalEl?.querySelector('#steerBtn')?.addEventListener('click', (e) => {
    lsSet('pixelnook_steer', steerPref() === 'relative' ? 'absolute' : 'relative');
    e.currentTarget.textContent = 'STEERING: ' + steerPref().toUpperCase();
    sfx.click();
    applyCam();
  });
}

// —— Leaderboard overlay ——
async function openBoard(game = 'snake') {
  let sel = game;
  let scores = null;
  const draw = () => {
    const list = scores?.[sel] || null;
    const shown = list && list.length ? list : localList(sel);
    const src = list ? (list.length ? '🌐 GLOBAL TOP 10' : '🌐 GLOBAL – empty so far, showing local') : (scores === null ? 'Loading…' : 'OFFLINE · LOCAL TOP 5');
    setModalInner(`
      <p class="info-kicker">LEADERBOARD</p>
      <h2 class="info-title" style="color:${GAMES[sel].accent}">${esc(GAMES[sel].title)}</h2>
      <div class="tabs">${Object.values(GAMES).map((g) => `<button type="button" class="tab${g.id === sel ? ' on' : ''}" data-tab="${g.id}" style="--accent:${g.accent}">${esc(g.title)}</button>`).join('')}</div>
      <p class="board-src">${src}</p>
      <ol class="board">${rows(shown, 10)}</ol>
      <p class="info-foot">Enter your initials after game over · Esc / B to close</p>`);
    modalEl.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { sel = b.dataset.tab; sfx.move(); draw(); modalEl.querySelector(`[data-tab="${sel}"]`)?.focus({ preventScroll: true }); }));
  };
  openModal('', { cls: 'wide', label: 'Leaderboard', pause: true });
  draw();
  modalEl.querySelector(`[data-tab="${sel}"]`)?.focus({ preventScroll: true });
  const res = await fetchAll(true);
  scores = res || false;
  if (modalEl) { const f = document.activeElement?.dataset?.tab; draw(); if (f) modalEl.querySelector(`[data-tab="${f}"]`)?.focus({ preventScroll: true }); }
}

// —— Shop overlay ——
function openShop() {
  const draw = (focusId) => {
    const P = getProgress();
    const item = (it, kind) => {
      const owned = !!P.owned[it.id];
      const active = kind === 'theme' ? P.theme === it.id : P.skins?.[it.game] === it.id;
      const state = active ? '✔ IN USE' : owned ? (kind === 'theme' ? 'USE' : 'EQUIP') : `${it.price} 🪙`;
      const sw = kind === 'theme' ? `<span class="sw theme-sw" data-sw="${it.id}"></span>` : `<span class="sw" style="background:${Object.values(it.colors)[0]};box-shadow:inset -6px -6px 0 ${Object.values(it.colors)[1] || 'rgba(0,0,0,.3)'}"></span>`;
      return `<button type="button" class="shop-item${active ? ' active' : ''}${!owned && P.coins < it.price ? ' poor' : ''}" data-buy="${it.id}" data-kind="${kind}">
        ${sw}<span class="si-name">${esc(it.name)}${kind === 'skin' ? `<small>${esc(gameName(it.game))}</small>` : ''}</span><span class="si-state">${state}</span></button>`;
    };
    setModalInner(`
      <p class="info-kicker">SHOP</p>
      <h2 class="info-title">🪙 ${P.coins} COINS</h2>
      <div class="info-body">
        <h3>CABINET THEMES</h3><div class="shop-grid">${THEMES.map((t) => item(t, 'theme')).join('')}</div>
        <h3>SKINS</h3><div class="shop-grid">${SKINS.map((s) => item(s, 'skin')).join('')}</div>
      </div>
      <p class="info-foot">Earn coins in every game, from badges and the daily challenge · everything is saved locally</p>`);
    modalEl.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.buy, kind = b.dataset.kind;
      const P2 = getProgress();
      if (!P2.owned[id]) {
        const r = buy(id);
        if (!r.ok) { sfx.die(); toast(r.reason === 'coins' ? 'Not enough coins yet 🪙' : 'Already owned'); return; }
        sfx.coin(); toast('Bought! 🛒');
      } else sfx.select();
      if (kind === 'theme') setTheme(id); else equipSkin(id);
      draw(id);
    }));
    if (focusId) modalEl.querySelector(`[data-buy="${focusId}"]`)?.focus({ preventScroll: true });
  };
  openModal('', { cls: 'wide', label: 'Shop', onClose: () => { if (!currentGame) renderHome(); } });
  draw();
  modalEl.querySelector('[data-buy]')?.focus({ preventScroll: true });
}

// —— Achievements overlay ——
function openAchievements() {
  const P = getProgress();
  const done = ACHIEVEMENTS.filter((a) => P.ach[a.id]).length;
  openModal(`
    <p class="info-kicker">BADGES</p>
    <h2 class="info-title">⭐ ${done} / ${ACHIEVEMENTS.length}</h2>
    <ul class="ach-list">${ACHIEVEMENTS.map((a) => `<li class="${P.ach[a.id] ? 'got' : ''}"><span class="ach-ic">${P.ach[a.id] ? '★' : '🔒'}</span><span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span></li>`).join('')}</ul>
    <p class="info-foot">Each badge gives +25 🪙 · total earned: ${P.earned} 🪙</p>`, { cls: 'wide', label: 'Badges' });
}

// —— Arcade initials entry ——
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function openInitials(id, score, refresh) {
  const L = lastInitials().split('');
  let pos = 0;
  let phase = 'enter';
  const draw = () => {
    if (phase !== 'enter') return;
    setModalInner(`
      <p class="info-kicker">NEW HIGH SCORE!</p>
      <h2 class="info-title">${esc(GAMES[id].title)} · ${score}</h2>
      <p class="ini-help">Enter your initials</p>
      <div class="ini">${L.map((c, i) => `
        <div class="ini-slot${i === pos ? ' on' : ''}" data-slot="${i}">
          <button type="button" class="ini-arrow" data-up="${i}" aria-label="Next letter">▲</button>
          <span class="ini-ch">${c}</span>
          <button type="button" class="ini-arrow" data-down="${i}" aria-label="Previous letter">▼</button>
        </div>`).join('')}</div>
      <div class="ini-actions">
        <button type="button" class="btn chunky small" id="iniSend">SUBMIT ▶</button>
        <button type="button" class="btn chunky small ghost" id="iniSkip">SKIP</button>
      </div>
      <p class="info-foot">Letters / ↑↓ change · ←→ move · Enter submit · Esc skip<br>🎮 ↑↓←→ · A / ✕ next/submit · B / ○ skip</p>`);
    const spin = (i, d) => { L[i] = CHARS[(CHARS.indexOf(L[i]) + d + CHARS.length) % CHARS.length]; pos = i; sfx.move(); draw(); };
    modalEl.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => spin(+b.dataset.up, 1)));
    modalEl.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => spin(+b.dataset.down, -1)));
    modalEl.querySelectorAll('.ini-ch').forEach((s, i) => s.addEventListener('click', () => { pos = i; draw(); }));
    modalEl.querySelector('#iniSend').addEventListener('click', send);
    modalEl.querySelector('#iniSkip').addEventListener('click', () => closeModal(true));
    modalEl.querySelector('#iniSend').focus({ preventScroll: true });
  };
  const spinPos = (d) => { L[pos] = CHARS[(CHARS.indexOf(L[pos]) + d + CHARS.length) % CHARS.length]; sfx.move(); draw(); };
  async function send() {
    if (phase !== 'enter') return;
    phase = 'sending';
    const name = L.join('');
    saveInitials(name);
    nameLatest(id, score, name);
    setModalInner(`<p class="info-kicker">LEADERBOARD</p><h2 class="info-title">${name} · ${score}</h2><p class="ini-help">Submitting…</p>`);
    sfx.select();
    const r = await submitScore(id, name, score);
    if (!modalEl) return;
    phase = 'done';
    let html;
    if (r.ok) {
      unlock('online');
      const mark = r.scores.findIndex((e) => e.name === name && e.score === score);
      html = `<p class="ini-help">${r.rank <= 10 ? `You're #${r.rank} in the world! 🌐` : `#${r.rank} worldwide`}</p><ol class="board">${rows(r.scores, 10, mark)}</ol>`;
      sfx.level();
    } else {
      html = `<p class="ini-help warn">${r.error === 'offline' ? 'Offline – saved to the local leaderboard.' : esc(r.error) + ' – saved locally.'}</p><ol class="board">${rows(localList(id), 5)}</ol>`;
    }
    setModalInner(`<p class="info-kicker">LEADERBOARD</p><h2 class="info-title">${esc(GAMES[id].title)}</h2>${html}
      <div class="ini-actions"><button type="button" class="btn chunky small" id="iniOk">OK</button></div>
      <p class="info-foot">Enter / A to close · R / Start for a new round</p>`);
    modalEl.querySelector('#iniOk').addEventListener('click', () => closeModal(true));
    modalEl.querySelector('#iniOk').focus({ preventScroll: true });
    refresh?.(r.ok ? r.scores.findIndex((e) => e.name === name && e.score === score) : -1);
  }
  const onKey = (e) => {
    if (phase === 'done') {
      if (e.key === 'r' || e.key === 'R') { closeModal(false); currentGame?.restart(); refresh?.(); return true; }
      return false;
    }
    if (phase !== 'enter') return true;
    const k = e.key || '';
    if (/^[a-zA-Z0-9]$/.test(k)) { L[pos] = k.toUpperCase(); pos = Math.min(2, pos + 1); sfx.move(); draw(); return true; }
    if (k === 'ArrowUp') { spinPos(1); return true; }
    if (k === 'ArrowDown') { spinPos(-1); return true; }
    if (k === 'ArrowLeft') { pos = Math.max(0, pos - 1); draw(); return true; }
    if (k === 'ArrowRight') { pos = Math.min(2, pos + 1); draw(); return true; }
    if (k === 'Backspace') { pos = Math.max(0, pos - 1); draw(); return true; }
    if (k === 'Enter') { send(); return true; }
    return false;
  };
  const onPad = (btn) => {
    if (phase === 'done') { if (btn === 'a' || btn === 'b') closeModal(true); else if (btn === 'start') { closeModal(false); currentGame?.restart(); refresh?.(); } return; }
    if (phase !== 'enter') return;
    if (btn === 'up') spinPos(1);
    else if (btn === 'down') spinPos(-1);
    else if (btn === 'left') { pos = Math.max(0, pos - 1); draw(); }
    else if (btn === 'right') { pos = Math.min(2, pos + 1); draw(); }
    else if (btn === 'a') { if (pos < 2) { pos++; sfx.move(); draw(); } else send(); }
    else if (btn === 'start') send();
    else if (btn === 'b') closeModal(true);
  };
  openModal('', { label: 'Enter initials', onKey, onPad, cls: 'ini-panel', onClose: () => refresh?.() });
  draw();
}

// —— Gamepad routing ——
function focusables(scope) {
  return [...scope.querySelectorAll('button, [tabindex="0"]')].filter((el) => el.offsetParent !== null && !el.disabled);
}
function navigate(dir, scope, skip = null) {
  const list = focusables(scope).filter((el) => !skip || !el.matches(skip));
  if (!list.length) return;
  const cur = document.activeElement;
  if (!list.includes(cur)) { (scope.querySelector('.cart, [data-tab].on, [data-buy], #iniSend') || list[0]).focus({ preventScroll: false }); return; }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestD = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (main <= 4) continue;
    const d = main + side * 2.5;
    if (d < bestD) { bestD = d; best = el; }
  }
  if (best) { best.focus({ preventScroll: false }); best.scrollIntoView?.({ block: 'nearest' }); sfx.move(); }
}

const TWO_P = new Set(['pixelpaddle', 'tankduel']);
const KEYSETS = {
  arrows: { up: ['ArrowUp', 'ArrowUp'], down: ['ArrowDown', 'ArrowDown'], left: ['ArrowLeft', 'ArrowLeft'], right: ['ArrowRight', 'ArrowRight'], a: ['Space', ' '], b: ['KeyX', 'x'] },
  p1: { up: ['KeyW', 'w'], down: ['KeyS', 's'], left: ['KeyA', 'a'], right: ['KeyD', 'd'], a: ['Space', ' '], b: ['KeyQ', 'q'] },
  p2: { up: ['ArrowUp', 'ArrowUp'], down: ['ArrowDown', 'ArrowDown'], left: ['ArrowLeft', 'ArrowLeft'], right: ['ArrowRight', 'ArrowRight'], a: ['Enter', 'Enter'], b: ['Enter', 'Enter'] },
};
const fakeKey = (code, key, repeat = false) => ({ code, key, repeat, preventDefault() {}, stopPropagation() {} });

function onPad({ pad, btn, down, repeat }) {
  if (btn === 'rb' && down && !repeat && !modalEl) { toggleFullscreen(); return; }
  if (btn === 'lb' && down && !repeat && !modalEl && currentGame) { cycleCam(); return; }
  if (modalEl) {
    if (!down) return;
    if (modalCfg?.onPad) return modalCfg.onPad(btn, pad);
    if (['up', 'down', 'left', 'right'].includes(btn)) navigate(btn, modalEl);
    else if (btn === 'a') document.activeElement?.click?.();
    else if (btn === 'b' || btn === 'start' || btn === 'y' || btn === 'select') closeModal(true);
    return;
  }
  if (currentGame) {
    const id = currentId;
    if (down && !repeat) {
      if (btn === 'start') { currentGame.onKey(fakeKey(lastStatus === 'Game Over' ? 'KeyR' : 'KeyP', lastStatus === 'Game Over' ? 'r' : 'p')); return; }
      if (btn === 'select') { sfx.blip(); renderHome(); return; }
      if (btn === 'y') { sfx.click(); openInfo(id); return; }
      if (btn === 'a' && lastStatus === 'Game Over') { currentGame.onKey(fakeKey('KeyR', 'r')); return; }
    }
    const set = TWO_P.has(id) ? (pad === 1 ? KEYSETS.p2 : KEYSETS.p1) : KEYSETS.arrows;
    const k = set[btn];
    if (!k) return;
    if (down) {
      if (repeat && !(id === 'blockdrop' && btn !== 'up')) return;
      currentGame.onKey(fakeKey(k[0], k[1], repeat));
    } else currentGame.onKeyUp?.(fakeKey(k[0], k[1]));
    return;
  }
  // menu
  if (!down) return;
  const home = app.querySelector('.home');
  if (!home) return;
  if (['up', 'down', 'left', 'right'].includes(btn)) navigate(btn, home, '.cart-info');
  else if (btn === 'a' || btn === 'start') {
    const el = document.activeElement;
    if (el && home.contains(el) && el !== document.body) el.click();
    else home.querySelector('.cart')?.focus();
  } else if (btn === 'y') {
    const cart = document.activeElement?.closest?.('.cart');
    if (cart) { sfx.click(); openInfo(cart.dataset.game); }
  } else if (btn === 'x') { sfx.click(); openBoard(dailyChallenge().game); }
}
// tiny hook for automated tests / debugging
window.__pixelnook = { get game() { return currentGame; }, get id() { return currentId; }, get view() { return view; }, get room() { return room; }, threeReady };

initGamepads(onPad, (gp, on) => toast(on ? '🎮 Controller connected' : '🎮 Controller disconnected'));

renderHome();
