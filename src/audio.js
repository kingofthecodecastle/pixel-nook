const MUTE_KEY = 'pixelnook_mute';

let ctx = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted() {
  return muted;
}

export function setMuted(v) {
  muted = !!v;
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

function tone(freq, dur = 0.08, type = 'square', vol = 0.08, slide = 0) {
  if (muted) return;
  try {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  } catch (_) {}
}

export const sfx = {
  blip: () => tone(440, 0.06),
  select: () => { tone(520, 0.05); setTimeout(() => tone(780, 0.08), 50); },
  eat: () => tone(660, 0.05, 'square', 0.07),
  clear: () => { tone(400, 0.08); setTimeout(() => tone(600, 0.08), 60); setTimeout(() => tone(800, 0.1), 120); },
  die: () => { tone(300, 0.15, 'sawtooth', 0.06, -200); setTimeout(() => tone(150, 0.2, 'sawtooth', 0.05), 100); },
  move: () => tone(180, 0.03, 'square', 0.03),
  drop: () => tone(220, 0.04, 'triangle', 0.05),
  level: () => { tone(523, 0.08); setTimeout(() => tone(659, 0.08), 80); setTimeout(() => tone(784, 0.12), 160); },
  pause: () => tone(350, 0.1, 'triangle', 0.05),
  click: () => tone(800, 0.03, 'square', 0.04),
};
