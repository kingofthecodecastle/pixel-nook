// Picks a render quality tier and steps it down automatically when frames get slow.
// high: bloom + shadows + motion trails + floor reflections · mid: bloom only, lower resolution · low: no post effects.
const KEY = 'pixelnook_quality';
export const TIERS = ['low', 'mid', 'high'];

const forced = (() => { try { return new URLSearchParams(location.search).get('q') || localStorage.getItem(KEY); } catch { return null; } })();
const pinned = TIERS.includes(forced); // a forced tier is never auto-lowered
function guess() {
  if (pinned) return forced;
  const mobile = matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (mobile) return cores >= 8 && mem >= 6 ? 'mid' : 'low';
  return cores >= 4 ? 'high' : 'mid';
}

let tier = guess();
const listeners = new Set();
export const getTier = () => tier;
export const onTier = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function setTier(t) {
  if (!TIERS.includes(t) || t === tier) return;
  tier = t;
  listeners.forEach((fn) => fn(tier));
}

/** Frame-time watchdog: average over ~2 s; drop one tier when it stays under ~40 fps. */
export function makeWatchdog() {
  let acc = 0, n = 0, last = 0, cooldown = 1.5;
  return (now) => {
    if (!last) { last = now; return; }
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (document.hidden || pinned) return;
    if (cooldown > 0) { cooldown -= dt; return; }
    acc += dt; n++;
    if (acc >= 2) {
      const avg = acc / n;
      acc = 0; n = 0;
      const i = TIERS.indexOf(tier);
      if (avg > 1 / 40 && i > 0) { setTier(TIERS[i - 1]); cooldown = 2; }
    }
  };
}

export function pixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, tier === 'high' ? 2 : tier === 'mid' ? 1.5 : 1);
}
