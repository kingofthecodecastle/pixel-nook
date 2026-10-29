// Pixel Nook global leaderboard — Vercel Function backed by Neon Postgres (SQL over HTTP, no dependencies).
// GET  /api/scores            -> { scores: { <game>: [{ name, score }] x10 } }
// GET  /api/scores?game=id    -> { game, scores: [...] }
// POST /api/scores { game, name, score } -> { ok, rank, scores }
import { createHash } from 'node:crypto';

const MAX = {
  snake: 20000, blockdrop: 999999, mazemunch: 200000, starblaster: 500000, brickbash: 200000, froghop: 300000,
  asteroiddrift: 1000000, pixelpaddle: 5000, ladderclimb: 300000, neonracer: 1000000, moondrop: 500000, tankduel: 1500,
};
const GAMES = Object.keys(MAX);
const NAME_RE = /^[A-Z0-9]{3}$/;
const BLOCKED = new Set(['ASS', 'FUK', 'FUC', 'FCK', 'SEX', 'KKK', 'NIG', 'FAG', 'CUM', 'TIT', 'DIK', 'COK', 'XXX', 'HOR', 'PIK', 'FAN', 'KUK', 'FIT']);
const RATE_PER_MIN = 6;
const RATE_PER_HOUR = 60;

function conn() { return process.env.DATABASE_URL || process.env.POSTGRES_URL || ''; }

async function sql(query, params = []) {
  const cs = conn();
  if (!cs) throw new Error('no database configured');
  const host = new URL(cs).hostname;
  const r = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': cs },
    body: JSON.stringify({ query, params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `db error ${r.status}`);
  return j.rows || [];
}

let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      await sql(`CREATE TABLE IF NOT EXISTS scores (
        id bigserial PRIMARY KEY,
        game text NOT NULL,
        name char(3) NOT NULL,
        score integer NOT NULL CHECK (score >= 0),
        ip_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now())`);
      await sql('CREATE INDEX IF NOT EXISTS scores_game_score ON scores (game, score DESC, created_at ASC)');
      await sql('CREATE INDEX IF NOT EXISTS scores_ip_time ON scores (ip_hash, created_at DESC)');
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

async function top(game) {
  const rows = await sql('SELECT name, score FROM scores WHERE game = $1 ORDER BY score DESC, created_at ASC LIMIT 10', [game]);
  return rows.map((r) => ({ name: String(r.name).trim(), score: Number(r.score) }));
}
async function topAll() {
  const rows = await sql(`SELECT game, name, score FROM (
      SELECT game, name, score, row_number() OVER (PARTITION BY game ORDER BY score DESC, created_at ASC) AS rn FROM scores
    ) t WHERE rn <= 10 ORDER BY game, rn`);
  const out = Object.fromEntries(GAMES.map((g) => [g, []]));
  for (const r of rows) if (out[r.game]) out[r.game].push({ name: String(r.name).trim(), score: Number(r.score) });
  return out;
}

function ipHash(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
  return createHash('sha256').update('pixelnook:' + ip + ':' + (process.env.NEON_PROJECT_ID || '')).digest('hex').slice(0, 32);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 2000) return null; }
  try { return JSON.parse(data || '{}'); } catch { return null; }
}

function send(res, status, obj, cache = 'no-store') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  try {
    await ensureSchema();
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      const game = url.searchParams.get('game');
      if (game) {
        if (!GAMES.includes(game)) return send(res, 400, { error: 'unknown game' });
        return send(res, 200, { game, scores: await top(game) }, 'public, max-age=0, s-maxage=5');
      }
      return send(res, 200, { scores: await topAll() }, 'public, max-age=0, s-maxage=5');
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body) return send(res, 400, { error: 'bad json' });
      const game = String(body.game || '');
      const name = String(body.name || '').toUpperCase();
      const score = Number(body.score);
      if (!GAMES.includes(game)) return send(res, 400, { error: 'unknown game' });
      if (!NAME_RE.test(name)) return send(res, 400, { error: 'initials must be 3 letters A–Z / 0–9' });
      if (BLOCKED.has(name)) return send(res, 400, { error: 'pick other initials' });
      if (!Number.isInteger(score) || score <= 0 || score > MAX[game]) return send(res, 400, { error: 'score out of range' });
      const ip = ipHash(req);
      const [rate] = await sql(`SELECT
          count(*) FILTER (WHERE created_at > now() - interval '1 minute') AS m,
          count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS h
        FROM scores WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`, [ip]);
      if (Number(rate.m) >= RATE_PER_MIN || Number(rate.h) >= RATE_PER_HOUR) {
        res.setHeader('Retry-After', '60');
        return send(res, 429, { error: 'too many submissions, try again in a minute' });
      }
      await sql('INSERT INTO scores (game, name, score, ip_hash) VALUES ($1, $2, $3, $4)', [game, name, score, ip]);
      const [r] = await sql('SELECT count(*) + 1 AS rank FROM scores WHERE game = $1 AND score > $2', [game, score]);
      return send(res, 201, { ok: true, rank: Number(r.rank), scores: await top(game) });
    }
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    return send(res, 503, { error: 'leaderboard unavailable' });
  }
}
