import { makeGame, rand, randi, clamp } from './kit.js';
import { getSkin } from '../progress.js';
import { emit } from '../fx.js';

const CS = 32, GC = 10, GR = 8, WT = 4;
const W = CS * GC, H = CS * GR;
const WIN = 5, TR = 9;
const P1_FIRE = ['Space', 'KeyQ'];
const P2_FIRE = ['Enter', 'NumpadEnter', 'Slash', 'Period', 'ShiftRight'];

function makeMaze() {
  // right[c][r] / down[c][r] = wall on that edge of cell (c,r)
  const right = Array.from({ length: GC }, () => Array(GR).fill(true));
  const down = Array.from({ length: GC }, () => Array(GR).fill(true));
  const seen = Array.from({ length: GC }, () => Array(GR).fill(false));
  const stack = [[0, 0]]; seen[0][0] = true;
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => [c + dc, r + dr, dc, dr])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < GC && y < GR && !seen[x][y]);
    if (!n.length) { stack.pop(); continue; }
    const [x, y, dc, dr] = n[(Math.random() * n.length) | 0];
    if (dc === 1) right[c][r] = false; else if (dc === -1) right[x][y] = false;
    else if (dr === 1) down[c][r] = false; else down[x][y] = false;
    seen[x][y] = true; stack.push([x, y]);
  }
  // open it up so it plays like an arena, not a pure maze
  for (let c = 0; c < GC; c++) for (let r = 0; r < GR; r++) {
    if (c < GC - 1 && right[c][r] && Math.random() < 0.45) right[c][r] = false;
    if (r < GR - 1 && down[c][r] && Math.random() < 0.45) down[c][r] = false;
  }
  const rects = [
    { x: 0, y: 0, w: W, h: WT }, { x: 0, y: H - WT, w: W, h: WT },
    { x: 0, y: 0, w: WT, h: H }, { x: W - WT, y: 0, w: WT, h: H },
  ];
  for (let c = 0; c < GC; c++) for (let r = 0; r < GR; r++) {
    if (c < GC - 1 && right[c][r]) rects.push({ x: (c + 1) * CS - WT / 2, y: r * CS - WT / 2, w: WT, h: CS + WT });
    if (r < GR - 1 && down[c][r]) rects.push({ x: c * CS - WT / 2, y: (r + 1) * CS - WT / 2, w: CS + WT, h: WT });
  }
  return { right, down, rects };
}

const circleHits = (x, y, rad, R) => {
  const cx = clamp(x, R.x, R.x + R.w), cy = clamp(y, R.y, R.y + R.h);
  return (x - cx) ** 2 + (y - cy) ** 2 < rad * rad;
};

export function createTankDuel(canvas, hooks) {
  return makeGame(canvas, hooks, {
    id: 'tankduel', W, H,
    extraKeys: ['Digit1', 'Digit2', 'Numpad1', 'Numpad2', 'KeyQ', 'Slash', 'Period', 'ShiftRight'],
    init(g) {
      const s = g.s;
      s.mode = null; s.sel = 0; s.round = 0;
      s.tanks = [];
      g.status('Choose mode');
    },
    press(name, g, code) {
      const s = g.s;
      if (!s.mode) {
        if (code === 'Digit1' || code === 'Numpad1') return choose(g, 1);
        if (code === 'Digit2' || code === 'Numpad2') return choose(g, 2);
        if (name === 'up' || name === 'down') { s.sel = 1 - s.sel; g.sfx.move(); }
        if (name === 'action' || name === 'left' || name === 'right') choose(g, s.sel + 1);
        return;
      }
      if (s.wait > 0) return;
      if (s.mode === 1) {
        if (name === 'action' || P1_FIRE.includes(code)) fire(g, s.tanks[0]);
      } else {
        if (P1_FIRE.includes(code) || (code === 'pad' && name === 'action')) fire(g, s.tanks[0]);
        if (P2_FIRE.includes(code)) fire(g, s.tanks[1]);
      }
    },
    update(dt, g) {
      const s = g.s;
      if (!s.mode) return;
      if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) newRound(g); return; }
      const [a, b] = s.tanks;
      // input
      if (s.mode === 1) {
        drive(g, a, g.held('left'), g.held('right'), g.held('up'), g.held('down'), dt);
        cpu(g, b, a, dt);
      } else {
        drive(g, a, g.rawHeld('KeyA') || g.padHeld('left'), g.rawHeld('KeyD') || g.padHeld('right'), g.rawHeld('KeyW') || g.padHeld('up'), g.rawHeld('KeyS') || g.padHeld('down'), dt);
        drive(g, b, g.rawHeld('ArrowLeft'), g.rawHeld('ArrowRight'), g.rawHeld('ArrowUp'), g.rawHeld('ArrowDown'), dt);
      }
      for (const t of s.tanks) t.cool -= dt;
      // bullets bounce off walls
      for (const bl of s.bullets) {
        bl.life -= dt;
        bl.x += bl.vx * dt;
        if (s.maze.rects.some((R) => circleHits(bl.x, bl.y, 2, R))) { bl.x -= bl.vx * dt; bl.vx = -bl.vx; bl.bounces++; g.sfx.bounce(); }
        bl.y += bl.vy * dt;
        if (s.maze.rects.some((R) => circleHits(bl.x, bl.y, 2, R))) { bl.y -= bl.vy * dt; bl.vy = -bl.vy; bl.bounces++; g.sfx.bounce(); }
        if (bl.bounces > 5) bl.life = 0;
        for (const t of s.tanks) {
          if (bl.life <= 0 || t.dead) continue;
          if (t === bl.owner && bl.age < 0.25) continue;
          if ((t.x - bl.x) ** 2 + (t.y - bl.y) ** 2 < (TR + 2) ** 2) { bl.life = 0; boom(g, t); }
        }
        bl.age += dt;
      }
      s.bullets = s.bullets.filter((bl) => bl.life > 0);
      for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      s.parts = s.parts.filter((p) => p.life > 0);
    },
    draw(ctx, g) {
      const s = g.s;
      ctx.fillStyle = '#14110a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1e1a10';
      for (let x = 0; x < W; x += 8) for (let y = (x / 8) % 2 ? 0 : 4; y < H; y += 8) ctx.fillRect(x, y, 2, 2);
      if (!s.mode) {
        g.text('TANK DUEL', W / 2, 58, 12, '#fdcb6e');
        g.text(`FIRST TO ${WIN} · SHOTS BOUNCE`, W / 2, 80, 6, '#9a8f7a');
        ['1 PLAYER VS CPU', '2 PLAYERS'].forEach((o, i) => g.text((s.sel === i ? '> ' : '  ') + o, W / 2, 124 + i * 26, 8, s.sel === i ? '#ffeaa7' : '#9a8f7a'));
        g.text('▲▼ choose · SPACE/● start', W / 2, 196, 6, '#9a8f7a');
        g.text('2P: WASD+SPACE vs ARROWS+ENTER', W / 2, 216, 6, '#9a8f7a');
        return;
      }
      for (const R of s.maze.rects) {
        ctx.fillStyle = '#8b5a2b'; ctx.fillRect(R.x, R.y, R.w, R.h);
        ctx.fillStyle = '#c08040'; ctx.fillRect(R.x, R.y, R.w, 1);
      }
      for (const t of s.tanks) if (!t.dead) drawTank(ctx, t);
      ctx.fillStyle = '#ffffff';
      for (const bl of s.bullets) ctx.fillRect((bl.x - 2) | 0, (bl.y - 2) | 0, 4, 4);
      for (const p of s.parts) { ctx.fillStyle = p.c; ctx.fillRect(p.x | 0, p.y | 0, 3, 3); }
      const [a, b] = s.tanks;
      g.text(`${s.mode === 1 ? 'YOU' : 'P1'} ${a.pts}`, 10, 16, 7, a.color, 'left');
      g.text(`${b.pts} ${s.mode === 1 ? 'CPU' : 'P2'}`, W - 10, 16, 7, b.color, 'right');
    },
  });

  function drawTank(ctx, t) {
    ctx.save();
    ctx.translate(Math.round(t.x), Math.round(t.y));
    ctx.rotate(t.a);
    ctx.fillStyle = '#111'; ctx.fillRect(-9, -9, 18, 4); ctx.fillRect(-9, 5, 18, 4);
    ctx.fillStyle = t.color; ctx.fillRect(-7, -6, 14, 12);
    ctx.fillStyle = t.dark; ctx.fillRect(-3, -3, 7, 6);
    ctx.fillStyle = t.color; ctx.fillRect(2, -1.5, 10, 3);
    ctx.restore();
  }

  function choose(g, mode) {
    const s = g.s;
    s.mode = mode;
    g.noSave = mode === 2;
    g.extra(mode === 1 ? 'CPU' : 'P2', 0);
    s.tanks = [
      { color: '#33ff66', dark: '#1b7a33', ...(getSkin('tankduel') || {}), pts: 0 },
      { color: '#ff4d6d', dark: '#8a1f33', pts: 0 },
    ];
    g.sfx.select();
    g.status('Playing');
    newRound(g);
  }

  function newRound(g) {
    const s = g.s;
    s.round += 1;
    s.maze = makeMaze();
    s.bullets = []; s.parts = []; s.wait = 0;
    const [a, b] = s.tanks;
    Object.assign(a, { x: CS / 2, y: H - CS / 2, a: -Math.PI / 2, cool: 0, dead: false });
    Object.assign(b, { x: W - CS / 2, y: CS / 2, a: Math.PI / 2, cool: 0.8, dead: false, path: null, repath: 0, stuck: 0, losT: 0 });
    g.note(`Round ${s.round}`);
  }

  function blocked(s, x, y) { return s.maze.rects.some((R) => circleHits(x, y, TR, R)); }

  function drive(g, t, left, right, fwd, back, dt) {
    if (t.dead) return;
    if (left) t.a -= 3.2 * dt;
    if (right) t.a += 3.2 * dt;
    const sp = (fwd ? 75 : 0) - (back ? 50 : 0);
    if (!sp) return;
    const s = g.s;
    const nx = t.x + Math.cos(t.a) * sp * dt, ny = t.y + Math.sin(t.a) * sp * dt;
    if (!blocked(s, nx, t.y)) t.x = nx;
    if (!blocked(s, t.x, ny)) t.y = ny;
  }

  function fire(g, t) {
    const s = g.s;
    if (!t || t.dead || t.cool > 0) return;
    if (s.bullets.filter((b) => b.owner === t).length >= 4) return;
    t.cool = 0.35;
    const bx = t.x + Math.cos(t.a) * 12, by = t.y + Math.sin(t.a) * 12;
    if (blocked(s, bx, by) && s.maze.rects.some((R) => circleHits(bx, by, 2, R))) return;
    s.bullets.push({ x: bx, y: by, vx: Math.cos(t.a) * 150, vy: Math.sin(t.a) * 150, life: 5, bounces: 0, owner: t, age: 0 });
    emit('shoot', bx, by);
  }

  function clearShot(s, a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    for (let i = 12; i < d; i += 4) {
      const x = a.x + ((b.x - a.x) * i) / d, y = a.y + ((b.y - a.y) * i) / d;
      if (s.maze.rects.some((R) => circleHits(x, y, 2, R))) return false;
    }
    return true;
  }

  function shotHits(s, t, foe) {
    let x = t.x + Math.cos(t.a) * 12, y = t.y + Math.sin(t.a) * 12;
    let vx = Math.cos(t.a) * 3, vy = Math.sin(t.a) * 3;
    const hitWall = (px, py) => s.maze.rects.some((R) => circleHits(px, py, 2, R));
    if (hitWall(x, y)) return false;
    for (let i = 0, b = 0; i < 260 && b <= 2; i++) {
      x += vx; if (hitWall(x, y)) { x -= vx; vx = -vx; b++; }
      y += vy; if (hitWall(x, y)) { y -= vy; vy = -vy; b++; }
      if ((foe.x - x) ** 2 + (foe.y - y) ** 2 < (TR - 1) ** 2) return true;
      if (i > 8 && (t.x - x) ** 2 + (t.y - y) ** 2 < (TR + 3) ** 2) return false;
    }
    return false;
  }

  function cellOf(t) { return [clamp(Math.floor(t.x / CS), 0, GC - 1), clamp(Math.floor(t.y / CS), 0, GR - 1)]; }

  function bfs(s, from, to) {
    const { right, down } = s.maze;
    const key = (c, r) => c * GR + r;
    const prev = new Map([[key(...from), null]]);
    const q = [from];
    while (q.length) {
      const [c, r] = q.shift();
      if (c === to[0] && r === to[1]) break;
      const nb = [];
      if (c < GC - 1 && !right[c][r]) nb.push([c + 1, r]);
      if (c > 0 && !right[c - 1][r]) nb.push([c - 1, r]);
      if (r < GR - 1 && !down[c][r]) nb.push([c, r + 1]);
      if (r > 0 && !down[c][r - 1]) nb.push([c, r - 1]);
      for (const n of nb) { const k = key(...n); if (!prev.has(k)) { prev.set(k, [c, r]); q.push(n); } }
    }
    const path = [];
    let cur = to;
    while (cur && prev.has(key(...cur))) { path.unshift(cur); cur = prev.get(key(...cur)); }
    return path;
  }

  function cpu(g, t, foe, dt) {
    const s = g.s;
    if (t.dead || foe.dead) return;
    const turnTo = (ang) => {
      let d = ang - t.a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    // fire whenever a simulated shot along the current heading (with bounces) would hit
    if (t.cool <= 0 && shotHits(s, t, foe)) { fire(g, t); t.cool = 0.8 + Math.random() * 0.5; }
    if (clearShot(s, t, foe) && t.losT < 2) {
      t.losT += dt;
      const d = turnTo(Math.atan2(foe.y - t.y, foe.x - t.x));
      drive(g, t, d < -0.03, d > 0.03, false, false, dt);
      return;
    }
    // in sight but no shot for 2 s: manoeuvre along the path for a bit, then try aiming again
    if (!clearShot(s, t, foe)) t.losT = 0;
    else { t.losT += dt; if (t.losT > 3.5) t.losT = 0; }
    t.repath -= dt;
    if (!t.path || t.repath <= 0) { t.path = bfs(s, cellOf(t), cellOf(foe)); t.repath = 0.6; }
    let target = t.path && t.path[1];
    const here = cellOf(t);
    if (target && here[0] === target[0] && here[1] === target[1]) { t.path.shift(); target = t.path[1]; }
    if (!target) return;
    const tx = target[0] * CS + CS / 2, ty = target[1] * CS + CS / 2;
    const d = turnTo(Math.atan2(ty - t.y, tx - t.x));
    const ox = t.x, oy = t.y;
    drive(g, t, d < -0.08, d > 0.08, Math.abs(d) < 0.6, false, dt);
    if (Math.hypot(t.x - ox, t.y - oy) < 0.01 && Math.abs(d) < 0.6) {
      t.stuck += dt;
      if (t.stuck > 0.5) { // nudge back toward cell centre
        const [c, r] = here; const cx = c * CS + CS / 2, cy = r * CS + CS / 2;
        t.x += (cx - t.x) * 0.2; t.y += (cy - t.y) * 0.2; t.stuck = 0;
      }
    }
  }

  function boom(g, victim) {
    const s = g.s;
    victim.dead = true;
    for (let i = 0; i < 20; i++) { const a = rand(0, 6.28), v = rand(30, 120); s.parts.push({ x: victim.x, y: victim.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.8), c: i % 2 ? victim.color : '#fdcb6e' }); }
    const [a, b] = s.tanks;
    const winner = victim === a ? b : a;
    winner.pts += 1;
    g.extra(s.mode === 1 ? 'CPU' : 'P2', b.pts);
    emit('boom', victim.x, victim.y, { color: victim.color, scale: 1.3 });
    g.flash(winner === a ? 'eat' : 'die');
    if (s.mode === 1 && winner === a) g.add(100);
    if (s.mode === 2 && winner === a) g.add(1);
    if (winner.pts >= WIN) {
      if (s.mode === 1 && winner === a) g.add(1000);
      const msg = s.mode === 1 ? (winner === a ? 'YOU WIN!' : 'CPU WINS') : (winner === a ? 'P1 WINS!' : 'P2 WINS!');
      g.gameOver(msg);
      return;
    }
    s.wait = 1.3;
  }
}
