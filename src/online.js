// Client for the global leaderboard (/api/scores) with a local fallback.
import { getHighScores } from './storage.js';

const API = '/api/scores';
const INITIALS_KEY = 'pixelnook_initials';
let cache = null; // { at, scores }
let online = null; // null = unknown, true/false after first call
const perGame = {}; // game -> latest top-10 list

async function req(url, opts = {}, ms = 4000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ac.signal });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  } finally { clearTimeout(t); }
}

export const isOnline = () => online;

/** All games' top 10 ({ game: [{name, score}] }) or null when offline. Cached for 20 s. */
export async function fetchAll(force = false) {
  if (!force && cache && Date.now() - cache.at < 20000) return cache.scores;
  try {
    const r = await req(API);
    if (!r.ok || !r.j.scores) throw new Error('bad');
    online = true;
    cache = { at: Date.now(), scores: r.j.scores };
    Object.assign(perGame, r.j.scores);
    return cache.scores;
  } catch {
    online = false;
    return null;
  }
}

export async function fetchGame(game) {
  try {
    const r = await req(`${API}?game=${encodeURIComponent(game)}`);
    if (!r.ok) throw new Error('bad');
    online = true;
    perGame[game] = r.j.scores;
    if (cache) cache.scores[game] = r.j.scores;
    return r.j.scores;
  } catch {
    online = false;
    return null;
  }
}

/** Submit a score. Returns { ok, rank?, scores?, error? }. */
export async function submitScore(game, name, score) {
  try {
    const r = await req(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game, name, score }) });
    if (r.ok) {
      online = true;
      perGame[game] = r.j.scores;
      if (cache) cache.scores[game] = r.j.scores;
      return { ok: true, rank: r.j.rank, scores: r.j.scores };
    }
    if (r.status >= 500) online = false;
    return { ok: false, error: r.j.error || `HTTP ${r.status}`, status: r.status };
  } catch {
    online = false;
    return { ok: false, error: 'offline' };
  }
}

export const cachedGame = (game) => perGame[game] || null;

/** Would this score make the global top 10? (true when unknown) */
export function qualifies(game, score) {
  const list = perGame[game];
  if (!list) return true;
  return list.length < 10 || score > list[list.length - 1].score;
}

export function localList(game) {
  return getHighScores(game).map((e) => ({ name: e.name && e.name !== 'YOU' ? e.name : 'YOU', score: e.score }));
}

export function lastInitials() { return localStorage.getItem(INITIALS_KEY) || 'AAA'; }
export function saveInitials(n) { try { localStorage.setItem(INITIALS_KEY, n); } catch (_) {} }
