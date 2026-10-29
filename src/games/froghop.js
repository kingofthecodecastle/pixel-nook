import { makeGame, sprite } from './kit.js';

const C = 32, COLS = 10, ROWS = 13;
const W = C * COLS, H = C * ROWS;
const HOMES = [1, 3, 6, 8];
const FROG = ['1.1111.1', '.122221.', '11211211', '.111111.', '11111111', '1.1111.1', '1......1'];
const LANES = [
  // river rows 1..5
  { row: 1, kind: 'log', dir: 1, speed: 38, len: 3, count: 3 },
  { row: 2, kind: 'log', dir: -1, speed: 55, len: 2, count: 3 },
  { row: 3, kind: 'log', dir: 1, speed: 30, len: 4, count: 2 },
  { row: 4, kind: 'log', dir: -1, speed: 46, len: 3, count: 3 },
  { row: 5, kind: 'log', dir: 1, speed: 62, len: 2, count: 3 },
  // road rows 7..11
  { row: 7, kind: 'car', dir: -1, speed: 70, len: 2, count: 2, color: '#fdcb6e' },
  { row: 8, kind: 'car', dir: 1, speed: 50, len: 1, count: 3, color: '#ff4d6d' },
  { row: 9, kind: 'car', dir: -1, speed: 90, len: 1, count: 2, color: '#74b9ff' },
  { row: 10, kind: 'car', dir: 1, speed: 40, len: 1, count: 3, color: '#a29bfe' },
  { row: 11, kind: 'car', dir: -1, speed: 60, len: 2, count: 2, color: '#e17055' },
];

export function createFrogHop(canvas, hooks) {
  return makeGame(canvas, hooks, {
    id: 'froghop', W, H,
    init(g) {
      const s = g.s;
      s.level = 1;
      s.homes = HOMES.map(() => false);
      g.setLives(3);
      buildLanes(g);
      spawn(g);
    },
    press(name, g) {
      const s = g.s, f = s.frog;
      if (s.dead > 0) return;
      let moved = false;
      if (name === 'up' || name === 'action') { f.row -= 1; moved = true; }
      else if (name === 'down' && f.row < ROWS - 1) { f.row += 1; moved = true; }
      else if (name === 'left') { f.x = Math.max(0, f.x - C); moved = true; }
      else if (name === 'right') { f.x = Math.min(W - C, f.x + C); moved = true; }
      if (!moved) return;
      f.face = name === 'action' ? 'up' : name;
      f.hop = 0.12;
      g.sfx.move();
      if (f.row >= 6) f.x = Math.round(f.x / C) * C; // snap on land
      if (f.row < s.best) { s.best = f.row; g.add(10); }
      if (f.row === 0) reachHome(g);
    },
    update(dt, g) {
      const s = g.s, f = s.frog;
      for (const ln of s.lanes) {
        for (const o of ln.objs) {
          o.x += ln.dir * ln.speed * dt;
          if (ln.dir > 0 && o.x > W) o.x -= ln.loop;
          if (ln.dir < 0 && o.x < W - ln.loop) o.x += ln.loop;
        }
      }
      if (s.dead > 0) { s.dead -= dt; if (s.dead <= 0 && !g.over) spawn(g); return; }
      f.hop = Math.max(0, f.hop - dt);
      s.timer -= dt;
      if (s.timer <= 0) { die(g, 'Time up!'); return; }
      const lane = s.lanes.find((l) => l.row === f.row);
      const fx = f.x + 6, fw = C - 12;
      if (lane && lane.kind === 'car') {
        for (const o of lane.objs) {
          if (fx < o.x + lane.len * C - 3 && fx + fw > o.x + 3) { die(g, 'Splat!'); return; }
        }
      } else if (lane && lane.kind === 'log') {
        const on = lane.objs.find((o) => f.x + C / 2 > o.x && f.x + C / 2 < o.x + lane.len * C);
        if (!on) { die(g, 'Splash!'); return; }
        f.x += lane.dir * lane.speed * dt;
        if (f.x < -C / 2 || f.x > W - C / 2) { die(g, 'Swept away!'); return; }
      }
    },
    draw(ctx, g) {
      const s = g.s;
      // water
      ctx.fillStyle = '#0a2a6a';
      ctx.fillRect(0, 0, W, C * 6);
      ctx.fillStyle = '#123c8c';
      for (let r = 1; r < 6; r++) for (let x = (r * 13) % 24; x < W; x += 24) ctx.fillRect(x, r * C + 14, 8, 2);
      // hedge row with homes
      ctx.fillStyle = '#1e6b2e';
      ctx.fillRect(0, 0, W, C);
      HOMES.forEach((col, i) => {
        ctx.fillStyle = '#0a2a6a';
        ctx.fillRect(col * C, 4, C, C - 4);
        ctx.fillStyle = '#33ff66';
        ctx.fillRect(col * C + 6, 12, C - 12, C - 16);
        if (s.homes[i]) sprite(ctx, FROG, col * C + 4, 4, 3, { 1: '#7CFC00', 2: '#111' });
      });
      // median + start
      ctx.fillStyle = '#5c3d8a';
      ctx.fillRect(0, C * 6, W, C);
      ctx.fillRect(0, C * 12, W, C);
      ctx.fillStyle = '#7a5aa8';
      for (let x = 0; x < W; x += 8) { ctx.fillRect(x, C * 6 + ((x / 8) % 2) * 4, 4, 4); ctx.fillRect(x, C * 12 + ((x / 8) % 2) * 4, 4, 4); }
      // road
      ctx.fillStyle = '#16161e';
      ctx.fillRect(0, C * 7, W, C * 5);
      ctx.fillStyle = '#d4c4a8';
      for (let r = 8; r < 12; r++) for (let x = 0; x < W; x += 32) ctx.fillRect(x + 4, r * C - 1, 14, 2);
      // lanes
      for (const ln of s.lanes) {
        for (const o of ln.objs) {
          const y = ln.row * C;
          const w = ln.len * C;
          if (ln.kind === 'log') {
            ctx.fillStyle = '#8b5a2b';
            ctx.fillRect(o.x, y + 5, w, C - 10);
            ctx.fillStyle = '#5c3d1e';
            for (let x = 6; x < w - 4; x += 12) ctx.fillRect(o.x + x, y + 10, 6, 2);
            ctx.fillStyle = '#a0703a';
            ctx.fillRect(o.x, y + 5, w, 3);
          } else {
            ctx.fillStyle = ln.color;
            ctx.fillRect(o.x + 2, y + 6, w - 4, C - 12);
            ctx.fillStyle = '#111';
            ctx.fillRect(o.x + 6, y + 3, 8, 4); ctx.fillRect(o.x + w - 14, y + 3, 8, 4);
            ctx.fillRect(o.x + 6, y + C - 7, 8, 4); ctx.fillRect(o.x + w - 14, y + C - 7, 8, 4);
            ctx.fillStyle = '#e0f7ff';
            const wx = ln.dir > 0 ? o.x + w - 12 : o.x + 6;
            ctx.fillRect(wx, y + 10, 6, C - 20);
          }
        }
      }
      // frog
      const f = s.frog;
      if (s.dead > 0) {
        ctx.fillStyle = Math.floor(s.dead * 10) % 2 ? '#ff4d6d' : '#fff';
        ctx.fillRect(f.x + 8, f.row * C + 8, 16, 16);
      } else {
        let art = FROG;
        if (f.face === 'down') art = FROG.slice().reverse();
        const lift = f.hop > 0 ? -3 : 0;
        sprite(ctx, art, f.x + 4, f.row * C + 5 + lift, 3, { 1: '#7CFC00', 2: '#111' });
      }
      // timer bar
      const frac = Math.max(0, s.timer / s.maxTime);
      ctx.fillStyle = '#000';
      ctx.fillRect(W - 104, H - 12, 100, 8);
      ctx.fillStyle = frac > 0.3 ? '#33ff66' : '#ff4d6d';
      ctx.fillRect(W - 103, H - 11, 98 * frac, 6);
      g.text(`LVL ${s.level}`, 6, H - 6, 7, '#ffeaa7', 'left');
    },
  });

  function buildLanes(g) {
    const s = g.s;
    const mul = 1 + (s.level - 1) * 0.18;
    s.lanes = LANES.map((d) => {
      const loop = W + (d.len + 1) * C;
      const objs = [];
      for (let i = 0; i < d.count; i++) objs.push({ x: W - loop + i * (loop / d.count) + C });
      return { ...d, speed: d.speed * mul, loop, objs };
    });
  }

  function spawn(g) {
    const s = g.s;
    s.frog = { x: 4 * C, row: ROWS - 1, face: 'up', hop: 0 };
    s.best = ROWS - 1;
    s.maxTime = Math.max(18, 32 - s.level * 2);
    s.timer = s.maxTime;
    s.dead = 0;
  }

  function die(g, why) {
    g.s.dead = 0.9;
    if (!g.hit()) g.note(why);
  }

  function reachHome(g) {
    const s = g.s, f = s.frog;
    const cx = f.x + C / 2;
    const i = HOMES.findIndex((col) => cx > col * C && cx < col * C + C);
    if (i < 0 || s.homes[i]) { die(g, 'Missed!'); return; }
    s.homes[i] = true;
    g.add(50 + Math.ceil(s.timer) * 5);
    g.sfx.clear();
    g.flash('eat');
    if (s.homes.every(Boolean)) {
      g.add(500);
      s.level += 1;
      s.homes = HOMES.map(() => false);
      buildLanes(g);
      g.sfx.level();
      g.flash('clear');
      g.note(`Level ${s.level}`);
    }
    spawn(g);
  }
}
