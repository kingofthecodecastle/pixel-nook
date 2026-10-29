// Web Audio: chiptune SFX + a generated menu loop (original composition, no samples).
const MUTE_KEY = 'pixelnook_mute';

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';
let reverb = null;     // arcade-room reverb send (menu)
let roomSend = false;  // menu sounds also go to the reverb
let pan = 0;           // stereo position for the next sounds (-1 left … 1 right)

/** Run fn with its sounds panned to p (-1 … 1). */
export function withPan(p, fn) { const o = pan; pan = p; try { fn(); } finally { pan = o; } }
/** In the menu the sounds get an arcade-room echo. */
export function setRoom(on) { roomSend = !!on; }

function makeImpulse(c, secs = 2.4, decay = 3.2) {
  const len = Math.floor(c.sampleRate * secs);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // early reflections + diffuse tail
      const early = i < c.sampleRate * 0.08 && i % Math.floor(c.sampleRate * (0.011 + ch * 0.004)) < 30 ? 0.6 : 0;
      d[i] = ((Math.random() * 2 - 1) + early) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}
/** Where a voice should connect: panner (if panned) and the reverb send (in the menu). */
function route(dest) {
  if (dest) return dest;
  const c = ctx;
  let node = master;
  if (pan) {
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = pan; p.connect(master); node = p; }
  }
  if (roomSend && reverb) {
    const g = c.createGain();
    g.connect(node); g.connect(reverb.send);
    return g;
  }
  return node;
}

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    try {
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx);
      const send = ctx.createGain(); send.gain.value = 0.32;
      const wet = ctx.createGain(); wet.gain.value = 0.55;
      send.connect(conv); conv.connect(wet); wet.connect(master);
      reverb = { send };
    } catch (_) { reverb = null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted() { return muted; }
export function setMuted(v) {
  muted = !!v;
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  if (master && ctx) { try { master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02); } catch (_) {} }
  if (muted) stopMusic(); else if (musicWanted) startMusic();
}
export function toggleMute() { setMuted(!muted); return muted; }

/** One oscillator note with attack/decay envelope and optional pitch slide. */
function tone(freq, dur = 0.08, type = 'square', vol = 0.08, slide = 0, delay = 0, dest = null) {
  if (muted) return;
  try {
    const c = getCtx();
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(route(dest));
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch (_) {}
}

/** Filtered noise burst (explosions, splashes, hats). */
function noise(dur = 0.2, vol = 0.12, freq = 1200, q = 0.8, type = 'lowpass', delay = 0, sweepTo = 0, dest = null) {
  if (muted) return;
  try {
    const c = getCtx();
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(route(dest));
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  } catch (_) {}
}

const arp = (notes, step, type = 'square', vol = 0.06, len = 0.09) => notes.forEach((n, i) => tone(n, len, type, vol, 0, i * step));

export const sfx = {
  blip: () => tone(660, 0.06, 'square', 0.05, 120),
  select: () => arp([523, 784, 1047], 0.05, 'square', 0.06, 0.08),
  eat: () => { tone(880, 0.05, 'square', 0.06, 300); tone(1320, 0.04, 'triangle', 0.04, 0, 0.03); },
  clear: () => { arp([523, 659, 784, 1047], 0.055, 'square', 0.06, 0.1); noise(0.25, 0.04, 6000, 0.7, 'highpass', 0.05); },
  die: () => { tone(440, 0.35, 'sawtooth', 0.07, -380); noise(0.4, 0.14, 900, 0.9, 'lowpass', 0, 120); },
  move: () => tone(240, 0.035, 'square', 0.03, 60),
  drop: () => { tone(160, 0.07, 'triangle', 0.08, -90); noise(0.05, 0.05, 2500, 1, 'bandpass'); },
  level: () => { arp([392, 523, 659, 784], 0.07, 'square', 0.06, 0.12); tone(1047, 0.3, 'triangle', 0.05, 0, 0.28); },
  pause: () => { tone(523, 0.08, 'triangle', 0.06); tone(392, 0.12, 'triangle', 0.06, 0, 0.08); },
  click: () => tone(1200, 0.025, 'square', 0.035),
  // extra voices used by the newer carts and the meta UI
  shoot: () => { tone(1400, 0.09, 'square', 0.045, -1100); noise(0.04, 0.03, 4000, 1, 'highpass'); },
  explode: () => { noise(0.5, 0.18, 1800, 0.7, 'lowpass', 0, 80); tone(110, 0.3, 'square', 0.05, -70); },
  jump: () => tone(300, 0.14, 'square', 0.05, 500),
  bounce: () => tone(520, 0.04, 'triangle', 0.06),
  splash: () => { noise(0.45, 0.13, 2800, 0.6, 'bandpass', 0, 400); tone(700, 0.2, 'sine', 0.04, -500, 0.02); },
  coin: () => { tone(988, 0.06, 'square', 0.05); tone(1319, 0.18, 'square', 0.05, 0, 0.06); },
  achieve: () => { arp([659, 784, 988, 1319], 0.08, 'square', 0.055, 0.14); arp([330, 392, 494, 659], 0.08, 'triangle', 0.05, 0.14); },
  thrust: () => noise(0.08, 0.035, 700, 0.8, 'lowpass'),
  // 3D-era voices: layered, punchier
  boom: () => {
    noise(0.9, 0.22, 2600, 0.6, 'lowpass', 0, 60);
    noise(0.18, 0.08, 5000, 0.7, 'highpass');
    tone(95, 0.55, 'sine', 0.28, -65);
    tone(220, 0.3, 'square', 0.05, -180);
    noise(0.35, 0.05, 900, 3, 'bandpass', 0.08, 200);
  },
  hit: () => { tone(170, 0.16, 'sine', 0.22, -120); noise(0.09, 0.09, 1800, 1.2, 'bandpass'); tone(90, 0.12, 'square', 0.04, -40, 0.02); },
  powerup: () => { arp([523, 659, 784, 1047, 1319, 1568], 0.035, 'square', 0.05, 0.07); tone(400, 0.35, 'triangle', 0.05, 1300); },
  brick: () => { tone(880 + Math.random() * 200, 0.05, 'triangle', 0.07, -200); noise(0.06, 0.06, 3200, 1.5, 'bandpass'); },
  whoosh: () => { noise(0.55, 0.13, 300, 1.4, 'bandpass', 0, 3200); tone(140, 0.5, 'sine', 0.06, 500); tone(1600, 0.25, 'triangle', 0.02, -900, 0.3); },
  whooshOut: () => { noise(0.5, 0.11, 3000, 1.4, 'bandpass', 0, 260); tone(600, 0.45, 'sine', 0.05, -460); },
};

// —— menu music: a short looping chiptune, scheduled ahead with a lookahead timer ——
const N = (s) => 440 * Math.pow(2, (s - 69) / 12); // midi -> Hz
// 4 bars × 16 steps, original progression Am – F – C – G
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const BASS = [45, 41, 48, 43];
const LEAD = [
  76, 0, 72, 0, 69, 0, 72, 74, 76, 0, 79, 0, 76, 74, 72, 0,
  77, 0, 76, 0, 72, 0, 69, 0, 72, 0, 74, 76, 74, 0, 0, 0,
  76, 0, 79, 0, 84, 0, 79, 76, 72, 0, 76, 0, 79, 0, 76, 74,
  74, 0, 71, 0, 67, 0, 71, 74, 79, 0, 78, 0, 79, 0, 0, 0,
];
const BPM = 128;
const STEP = 60 / BPM / 4;
let musicWanted = false;
let timer = 0;
let nextT = 0;
let step = 0;
let musicBus = null;

function scheduleStep(t, i) {
  const bar = Math.floor(i / 16) % 4, s = i % 16;
  const L = LEAD[(i % 64)];
  if (L) voice(N(L), t, STEP * 1.6, 'square', 0.028);
  if (s % 4 === 0) voice(N(BASS[bar]), t, STEP * 3, 'triangle', 0.09);
  if (s % 4 === 2) voice(N(BASS[bar] + 12), t, STEP * 1.5, 'triangle', 0.06);
  const ch = CHORDS[bar];
  voice(N(ch[s % 3] + 12), t, STEP * 0.8, 'square', 0.012);
  if (s % 2 === 0) hat(t, s % 8 === 4 ? 0.05 : 0.02);
  if (s % 8 === 4) snare(t);
}
function voice(f, t, d, type, vol) {
  const c = ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + d + 0.02);
}
function hat(t, vol) {
  const c = ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  src.connect(f); f.connect(g); g.connect(musicBus); src.start(t); src.stop(t + 0.06);
}
function snare(t) {
  const c = ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
  g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(f); f.connect(g); g.connect(musicBus); src.start(t); src.stop(t + 0.14);
}

export function startMusic() {
  musicWanted = true;
  if (muted || timer) return;
  // don't create the context before a gesture (avoids Chrome's autoplay warning); resumeAudio() retries
  if (!ctx && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    const c = getCtx();
    if (c.state !== 'running') return; // needs a user gesture first; retried by resumeAudio()
    musicBus = c.createGain();
    musicBus.gain.setValueAtTime(0.0001, c.currentTime);
    musicBus.gain.exponentialRampToValueAtTime(0.8, c.currentTime + 0.6);
    musicBus.connect(master);
    if (reverb) musicBus.connect(reverb.send);
    nextT = c.currentTime + 0.05;
    timer = setInterval(() => {
      while (nextT < ctx.currentTime + 0.15) { scheduleStep(nextT, step++); nextT += STEP; }
    }, 25);
  } catch (_) {}
}
export function stopMusic(forget = false) {
  if (forget) musicWanted = false;
  if (timer) { clearInterval(timer); timer = 0; }
  if (musicBus && ctx) {
    const b = musicBus;
    try { b.gain.cancelScheduledValues(ctx.currentTime); b.gain.setValueAtTime(b.gain.value, ctx.currentTime); b.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25); } catch (_) {}
    setTimeout(() => { try { b.disconnect(); } catch (_) {} }, 400);
    musicBus = null;
  }
}
export const isMusicPlaying = () => !!timer;
/** Call from a user gesture: unlocks audio and starts the menu loop if it is wanted. */
export function resumeAudio() {
  if (muted) return;
  try { const c = getCtx(); c.resume().then(() => { if (musicWanted) startMusic(); }); } catch (_) {}
}
