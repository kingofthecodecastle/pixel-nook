// Positional game events: plays the sound panned to where it happens and tells the 3D view
// (particles, light flash, screen shake). x/y are in the game's canvas pixels.
import { sfx, withPan } from './audio.js';

const listeners = new Set();
let width = 1;
export const onFx = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const setFxWidth = (w) => { width = w || 1; };

const SOUND = {
  explode: 'boom', boom: 'boom', hit: 'hit', die: 'die', powerup: 'powerup', coin: 'coin', eat: 'eat',
  splash: 'splash', bounce: 'bounce', shoot: 'shoot', clear: 'clear', level: 'level', land: 'level', jump: 'jump', brick: 'brick',
};

export function emit(kind, x, y, opts = {}) {
  const pan = Math.max(-1, Math.min(1, (x / width) * 2 - 1)) * 0.85;
  const name = opts.sound === undefined ? SOUND[kind] : opts.sound;
  if (name && sfx[name]) withPan(pan, sfx[name]);
  listeners.forEach((fn) => fn({ kind, x, y, ...opts }));
}
