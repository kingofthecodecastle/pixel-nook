import { makeGame, rand } from './kit.js';
import { emit } from '../fx.js';

const W = 320, H = 360;
const SIZES = { 3: { r: 26, pts: 20, v: 40 }, 2: { r: 15, pts: 50, v: 65 }, 1: { r: 8, pts: 100, v: 95 } };
const wrap = (o) => {
  if (o.x < 0) o.x += W; if (o.x >= W) o.x -= W;
  if (o.y < 0) o.y += H; if (o.y >= H) o.y -= H;
};
const dist2 = (a, b) => {
  let dx = Math.abs(a.x - b.x); let dy = Math.abs(a.y - b.y);
  dx = Math.min(dx, W - dx); dy = Math.min(dy, H - dy);
  return dx * dx + dy * dy;
};

export function createAsteroidDrift(canvas, hooks) {
  return makeGame(canvas, hooks, {
    id: 'asteroiddrift', W, H,
    init(g) {
      const s = g.s;
      s.wave = 0;
      s.stars = Array.from({ length: 40 }, () => ({ x: rand(0, W), y: rand(0, H), b: Math.random() }));
      s.shots = []; s.parts = [];
      g.setLives(3);
      resetShip(g);
      nextWave(g);
    },
    press(name, g) { if (name === 'action') fire(g); },
    update(dt, g) {
      const s = g.s, sh = s.ship;
      s.cool -= dt; s.inv -= dt;
      if (s.respawn > 0) {
        s.respawn -= dt;
        if (s.respawn <= 0) resetShip(g);
      } else {
        if (g.held('left')) sh.a -= 4.2 * dt;
        if (g.held('right')) sh.a += 4.2 * dt;
        sh.thrust = g.held('up');
        if (sh.thrust) { sh.vx += Math.cos(sh.a) * 190 * dt; sh.vy += Math.sin(sh.a) * 190 * dt; }
        if (g.held('down')) { sh.vx *= 1 - 2.5 * dt; sh.vy *= 1 - 2.5 * dt; }
        sh.vx *= 1 - 0.35 * dt; sh.vy *= 1 - 0.35 * dt;
        const sp = Math.hypot(sh.vx, sh.vy);
        if (sp > 220) { sh.vx *= 220 / sp; sh.vy *= 220 / sp; }
        sh.x += sh.vx * dt; sh.y += sh.vy * dt; wrap(sh);
        if (g.held('action')) fire(g);
      }
      for (const b of s.shots) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; wrap(b); }
      s.shots = s.shots.filter((b) => b.life > 0);
      for (const r of s.rocks) { r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt; wrap(r); }
      for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      s.parts = s.parts.filter((p) => p.life > 0);

      const born = [];
      for (const r of s.rocks) {
        if (r.dead) continue;
        const R = SIZES[r.size].r;
        for (const b of s.shots) {
          if (b.life > 0 && dist2(b, r) < R * R) {
            b.life = 0; r.dead = true;
            g.add(SIZES[r.size].pts);
            emit(r.size > 1 ? 'boom' : 'explode', r.x, r.y, { scale: 0.6 + r.size * 0.25 });
            burst(s, r.x, r.y, '#d4c4a8', 8);
            if (r.size > 1) for (let i = 0; i < 2; i++) born.push(makeRock(r.size - 1, r.x, r.y, s.wave));
            break;
          }
        }
        if (!r.dead && s.respawn <= 0 && s.inv <= 0 && dist2(sh, r) < (R + 7) * (R + 7)) {
          burst(s, sh.x, sh.y, '#33ff66', 16);
          emit('boom', sh.x, sh.y, { color: '#33ff66', scale: 1.2 });
          if (!g.hit()) { s.respawn = 1.2; }
          else s.respawn = 999;
          sh.x = -999;
        }
      }
      s.rocks = s.rocks.filter((r) => !r.dead).concat(born);
      if (!s.rocks.length) {
        g.add(200 * s.wave);
        emit('level', W / 2, H / 2);
        g.flash('clear');
        nextWave(g);
      }
    },
    draw(ctx, g) {
      const s = g.s;
      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, W, H);
      for (const st of s.stars) {
        ctx.fillStyle = st.b > 0.7 ? '#9a8f7a' : '#2a2a44';
        ctx.fillRect(st.x | 0, st.y | 0, 2, 2);
      }
      ctx.lineWidth = 2;
      ctx.lineJoin = 'miter';
      for (const r of s.rocks) {
        const R = SIZES[r.size].r;
        ctx.strokeStyle = r.size === 3 ? '#d4c4a8' : r.size === 2 ? '#fdcb6e' : '#e17055';
        ctx.beginPath();
        r.shape.forEach((k, i) => {
          const a = r.rot + (i / r.shape.length) * Math.PI * 2;
          const x = Math.round(r.x + Math.cos(a) * R * k);
          const y = Math.round(r.y + Math.sin(a) * R * k);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }
      ctx.fillStyle = '#7CFC00';
      for (const b of s.shots) ctx.fillRect(b.x - 1, b.y - 1, 3, 3);
      for (const p of s.parts) { ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 2, 2); }
      const sh = s.ship;
      if (s.respawn <= 0 && (s.inv <= 0 || Math.floor(s.inv * 10) % 2 === 0)) {
        const pt = (ang, len) => [sh.x + Math.cos(sh.a + ang) * len, sh.y + Math.sin(sh.a + ang) * len];
        ctx.strokeStyle = '#33ff66';
        ctx.beginPath();
        ctx.moveTo(...pt(0, 11)); ctx.lineTo(...pt(2.5, 9)); ctx.lineTo(...pt(Math.PI, 4)); ctx.lineTo(...pt(-2.5, 9));
        ctx.closePath(); ctx.stroke();
        if (sh.thrust && Math.random() > 0.3) {
          ctx.strokeStyle = '#ff4d6d';
          ctx.beginPath(); ctx.moveTo(...pt(2.8, 6)); ctx.lineTo(...pt(Math.PI, 13)); ctx.lineTo(...pt(-2.8, 6)); ctx.stroke();
        }
      }
      g.text(`WAVE ${s.wave}`, 8, 14, 7, '#a29bfe', 'left');
    },
  });

  function makeRock(size, x, y, wave) {
    const a = rand(0, Math.PI * 2);
    const v = SIZES[size].v * rand(0.7, 1.2) * (1 + wave * 0.06);
    return {
      size, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rand(0, 6), spin: rand(-1.2, 1.2),
      shape: Array.from({ length: 10 }, () => rand(0.72, 1.05)),
    };
  }

  function nextWave(g) {
    const s = g.s;
    s.wave += 1;
    s.rocks = [];
    const n = Math.min(3 + s.wave, 9);
    for (let i = 0; i < n; i++) {
      let x, y;
      do { x = rand(0, W); y = rand(0, H); } while (Math.hypot(x - s.ship.x, y - s.ship.y) < 100);
      s.rocks.push(makeRock(3, x, y, s.wave));
    }
    s.inv = Math.max(s.inv, 1.5);
    g.note(`Wave ${s.wave}`);
  }

  function resetShip(g) {
    const s = g.s;
    s.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, thrust: false };
    s.respawn = 0; s.inv = 2; s.cool = 0;
  }

  function fire(g) {
    const s = g.s, sh = s.ship;
    if (s.cool > 0 || s.respawn > 0 || s.shots.length >= 6) return;
    s.cool = 0.2;
    s.shots.push({ x: sh.x + Math.cos(sh.a) * 11, y: sh.y + Math.sin(sh.a) * 11, vx: sh.vx + Math.cos(sh.a) * 300, vy: sh.vy + Math.sin(sh.a) * 300, life: 0.9 });
    emit('shoot', g.s.ship.x, g.s.ship.y);
  }

  function burst(s, x, y, c, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28); const v = rand(30, 110);
      s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.7), c });
    }
  }
}
