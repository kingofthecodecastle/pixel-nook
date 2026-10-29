// Coins, achievements, shop (themes + skins) and the daily challenge — all stored locally.
const KEY = 'pixelnook_progress';
const GAME_IDS = ['snake', 'blockdrop', 'mazemunch', 'starblaster', 'brickbash', 'froghop', 'asteroiddrift', 'pixelpaddle', 'ladderclimb', 'neonracer', 'moondrop', 'tankduel'];
const NAMES = { snake: 'Snake', blockdrop: 'Block Drop', mazemunch: 'Maze Munch', starblaster: 'Star Blaster', brickbash: 'Brick Bash', froghop: 'Frog Hop', asteroiddrift: 'Asteroid Drift', pixelpaddle: 'Pixel Paddle', ladderclimb: 'Ladder Climb', neonracer: 'Neon Racer', moondrop: 'Moon Drop', tankduel: 'Tank Duel' };

// points per coin (so a typical round pays roughly 5–30 coins)
const COIN_RATE = { snake: 10, blockdrop: 40, mazemunch: 50, starblaster: 50, brickbash: 25, froghop: 40, asteroiddrift: 100, pixelpaddle: 60, ladderclimb: 40, neonracer: 30, moondrop: 30, tankduel: 50 };
// "master" achievement thresholds
const MASTER = { snake: 300, blockdrop: 3000, mazemunch: 2000, starblaster: 2000, brickbash: 800, froghop: 1500, asteroiddrift: 5000, pixelpaddle: 1500, ladderclimb: 1500, neonracer: 1500, moondrop: 1000, tankduel: 1500 };
// daily challenge targets: [easy, medium, hard]
const DAILY = { snake: [100, 200, 300], blockdrop: [300, 800, 1500], mazemunch: [500, 1000, 1800], starblaster: [400, 900, 1600], brickbash: [150, 350, 700], froghop: [300, 700, 1200], asteroiddrift: [800, 2000, 4000], pixelpaddle: [300, 600, 1100], ladderclimb: [300, 700, 1200], neonracer: [300, 700, 1200], moondrop: [200, 500, 900], tankduel: [300, 600, 1100] };
export const DAILY_REWARD = [40, 60, 90];

export const THEMES = [
  { id: 'wood', name: 'Treverk', price: 0 },
  { id: 'arctic', name: 'Arktis', price: 120 },
  { id: 'neon', name: 'Neon', price: 160 },
  { id: 'chrome', name: 'Krom', price: 220 },
  { id: 'gold', name: 'Gull', price: 400 },
];
export const SKINS = [
  { id: 'snake-gold', game: 'snake', name: 'Gullslange', price: 80, colors: { head: '#ffe066', body: '#c9a227' } },
  { id: 'snake-ice', game: 'snake', name: 'Isslange', price: 80, colors: { head: '#bff6ff', body: '#4fb3d9' } },
  { id: 'frog-pink', game: 'froghop', name: 'Rosa frosk', price: 70, colors: { body: '#ff7eb6' } },
  { id: 'ship-red', game: 'starblaster', name: 'Rødt skip', price: 90, colors: { body: '#ff4d6d', trim: '#ffeaa7' } },
  { id: 'tank-camo', game: 'tankduel', name: 'Kamuflasje', price: 90, colors: { color: '#a3b84a', dark: '#4f5d1f' } },
  { id: 'lander-gold', game: 'moondrop', name: 'Gull-lander', price: 90, colors: { body: '#ffe066' } },
];

export const ACHIEVEMENTS = [
  { id: 'first', name: 'Første cart', desc: 'Spill ditt første spill' },
  { id: 'all12', name: 'Samler', desc: 'Spill alle 12 carts' },
  { id: 'daily1', name: 'Dagens helt', desc: 'Fullfør en dagens utfordring' },
  { id: 'daily5', name: 'Fast gjest', desc: 'Fullfør 5 dagens utfordringer' },
  { id: 'coins250', name: 'Myntsamler', desc: 'Tjen 250 mynter totalt' },
  { id: 'coins1000', name: 'Skattkiste', desc: 'Tjen 1000 mynter totalt' },
  { id: 'shopper', name: 'Kunde', desc: 'Kjøp noe i butikken' },
  { id: 'online', name: 'På tavla', desc: 'Send inn en score til den globale topplisten' },
  ...GAME_IDS.map((g) => ({ id: 'master_' + g, name: NAMES[g] + '-mester', desc: `${MASTER[g]} poeng i ${NAMES[g]}`, game: g })),
];
const ACH_REWARD = 25;

function load() {
  try { return { coins: 0, earned: 0, ach: {}, played: {}, owned: { wood: true }, theme: 'wood', skins: {}, daily: {}, dailyCount: 0, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { coins: 0, earned: 0, ach: {}, played: {}, owned: { wood: true }, theme: 'wood', skins: {}, daily: {}, dailyCount: 0 }; }
}
let P = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (_) {} };
const listeners = new Set();
export function onProgress(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(evt) { listeners.forEach((fn) => fn(evt)); }

export const getProgress = () => P;
export const gameName = (id) => NAMES[id] || id;

function addCoins(n, why) {
  if (n <= 0) return;
  P.coins += n; P.earned += n;
  if (P.earned >= 250) unlock('coins250');
  if (P.earned >= 1000) unlock('coins1000');
  save();
  emit({ type: 'coins', n, why });
}

export function unlock(id) {
  if (P.ach[id]) return false;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return false;
  P.ach[id] = Date.now();
  save();
  emit({ type: 'achievement', a });
  addCoins(ACH_REWARD, 'achievement');
  return true;
}

export function markPlayed(game) {
  P.played[game] = (P.played[game] || 0) + 1;
  save();
  unlock('first');
  if (GAME_IDS.every((g) => P.played[g])) unlock('all12');
}

/** Called on game over. Returns coins earned. */
export function finishGame(game, score, { noSave = false } = {}) {
  const rate = COIN_RATE[game] || 50;
  let n = score > 0 ? Math.max(1, Math.floor(score / rate)) : 0;
  if (noSave) n = Math.min(n, 5); // 2-player rounds pay a little
  addCoins(n, 'game');
  if (!noSave && score >= (MASTER[game] || Infinity)) unlock('master_' + game);
  return n;
}

// —— daily challenge (deterministic per Oslo calendar date — the same for everyone) ——
export function todayKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function dailyChallenge(key = todayKey()) {
  const h = hash('pixelnook:' + key);
  const game = GAME_IDS[h % GAME_IDS.length];
  const tier = (h >>> 8) % 3;
  const target = DAILY[game][tier];
  return { key, game, tier, target, reward: DAILY_REWARD[tier], label: `Få ${target} poeng i ${NAMES[game]}`, done: !!P.daily[key] };
}
/** Check during play / at game over. Returns the challenge if it was just completed. */
export function checkDaily(game, score, noSave = false) {
  const d = dailyChallenge();
  if (d.done || noSave || game !== d.game || score < d.target) return null;
  P.daily[d.key] = Date.now();
  P.dailyCount = (P.dailyCount || 0) + 1;
  save();
  emit({ type: 'daily', d });
  addCoins(d.reward, 'daily');
  unlock('daily1');
  if (P.dailyCount >= 5) unlock('daily5');
  return d;
}

// —— shop ——
export function buy(id) {
  const item = THEMES.find((t) => t.id === id) || SKINS.find((s) => s.id === id);
  if (!item || P.owned[id]) return { ok: false, reason: 'owned' };
  if (P.coins < item.price) return { ok: false, reason: 'coins' };
  P.coins -= item.price;
  P.owned[id] = true;
  save();
  unlock('shopper');
  emit({ type: 'buy', item });
  return { ok: true };
}
export function setTheme(id) { if (!P.owned[id]) return; P.theme = id; save(); applyTheme(); }
export function equipSkin(id) {
  const s = SKINS.find((x) => x.id === id);
  if (!s || !P.owned[id]) return;
  P.skins[s.game] = P.skins[s.game] === id ? null : id; // toggle
  save();
}
export function applyTheme() { document.documentElement.dataset.theme = P.theme || 'wood'; }
/** Equipped skin colours for a game, or null (games use their own defaults). */
export function getSkin(game) {
  const id = P.skins && P.skins[game];
  const s = id && SKINS.find((x) => x.id === id);
  return s ? s.colors : null;
}
export function _resetForTests() { P = load(); }
