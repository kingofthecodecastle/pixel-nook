import { makeGame, sprite, rand, overlap } from './kit.js';
import { getSkin } from '../progress.js';
import { emit } from '../fx.js';

const W = 320, H = 400;
const ALIEN_A = ['..1111..', '.111111.', '11.11.11', '11111111', '.1.11.1.', '1......1'];
const ALIEN_B = ['.1....1.', '..1111..', '.1.11.1.', '11111111', '1.1111.1', '..1..1..'];
const ALIEN_C = ['...11...', '..1111..', '.11..11.', '11111111', '..1..1..', '.1.11.1.'];
const SHIP = ['....1....', '...111...', '...121...', '.1111111.', '111111111', '11.111.11'];
const ROWS_DEF = [
  { art: ALIEN_C, color: '#ff4d6d', pts: 30 },
  { art: ALIEN_B, color: '#ffeaa7', pts: 20 },
  { art: ALIEN_B, color: '#ffeaa7', pts: 20 },
  { art: ALIEN_A, color: '#74b9ff', pts: 10 },
  { art: ALIEN_A, color: '#74b9ff', pts: 10 },
];

export function createStarBlaster(canvas, hooks) {
  return makeGame(canvas, hooks, {
    id: 'starblaster', W, H,
    init(g) {
      const s = g.s;
      s.wave = 0;
      s.stars = Array.from({ length: 50 }, () => ({ x: rand(0, W), y: rand(0, H), v: rand(10, 40) }));
      s.ship = { x: W / 2 - 13, y: H - 34, w: 27, h: 18 };
      s.shots = []; s.bombs = []; s.booms = [];
      s.cool = 0; s.inv = 0;
      g.setLives(3);
      nextWave(g);
    },
    press(name, g) {
      if (name === 'action' || name === 'up') fire(g);
    },
    update(dt, g) {
      const s = g.s;
      for (const st of s.stars) { st.y += st.v * dt; if (st.y > H) { st.y = 0; st.x = rand(0, W); } }
      const ship = s.ship;
      if (g.held('left')) ship.x -= 170 * dt;
      if (g.held('right')) ship.x += 170 * dt;
      ship.x = Math.max(4, Math.min(W - ship.w - 4, ship.x));
      s.cool -= dt; s.inv -= dt;
      if (g.held('action') || g.held('up')) fire(g);

      for (const b of s.shots) b.y -= 320 * dt;
      s.shots = s.shots.filter((b) => b.y > -10 && !b.dead);
      for (const b of s.bombs) b.y += b.v * dt;
      s.bombs = s.bombs.filter((b) => b.y < H && !b.dead);

      // swarm movement
      const alive = s.aliens.filter((a) => !a.dead);
      const speed = s.baseSpeed + (1 - alive.length / s.total) * 90;
      let minX = W, maxX = 0, maxY = 0;
      for (const a of alive) { minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x + a.w); maxY = Math.max(maxY, a.y + a.h); }
      s.dir = s.dir || 1;
      if ((s.dir > 0 && maxX >= W - 6) || (s.dir < 0 && minX <= 6)) {
        s.dir *= -1;
        for (const a of alive) a.y += 10;
      }
      s.anim += dt * (1 + speed / 40);
      for (const a of alive) a.x += s.dir * speed * dt;

      // alien fire
      s.bombT -= dt;
      if (s.bombT <= 0 && alive.length) {
        s.bombT = Math.max(0.35, 1.4 - s.wave * 0.12) * rand(0.6, 1.2);
        const shooter = alive[(Math.random() * alive.length) | 0];
        s.bombs.push({ x: shooter.x + shooter.w / 2 - 1, y: shooter.y + shooter.h, w: 3, h: 8, v: 120 + s.wave * 12 });
      }

      // collisions
      for (const b of s.shots) {
        for (const a of alive) {
          if (!a.dead && overlap(b, a)) {
            a.dead = true; b.dead = true;
            g.add(a.pts);
            emit('explode', a.x + a.w / 2, a.y + a.h / 2, { color: a.color, scale: 0.8 });
            s.booms.push({ x: a.x + a.w / 2, y: a.y + a.h / 2, t: 0.3, c: a.color });
            break;
          }
        }
      }
      if (s.inv <= 0) {
        for (const b of s.bombs) {
          if (overlap(b, ship)) { b.dead = true; shipHit(g); break; }
        }
      }
      if (maxY >= ship.y) { g.gameOver('INVADED!'); return; }
      for (const bm of s.booms) bm.t -= dt;
      s.booms = s.booms.filter((bm) => bm.t > 0);

      if (!alive.some((a) => !a.dead)) {
        g.add(100 * s.wave);
        emit('level', W / 2, H / 2);
        g.flash('clear');
        nextWave(g);
      }
    },
    draw(ctx, g) {
      const s = g.s;
      ctx.fillStyle = '#05051a';
      ctx.fillRect(0, 0, W, H);
      for (const st of s.stars) {
        ctx.fillStyle = st.v > 30 ? '#ffffff' : '#5a5a8a';
        ctx.fillRect(st.x | 0, st.y | 0, 2, 2);
      }
      const frame = Math.floor(s.anim * 2) % 2;
      for (const a of s.aliens) {
        if (a.dead) continue;
        const art = frame ? a.art.map((r) => r.split('').reverse().join('')) : a.art;
        sprite(ctx, art, a.x, a.y, 3, { 1: a.color });
      }
      for (const bm of s.booms) {
        ctx.fillStyle = bm.c;
        const r = (0.3 - bm.t) * 40;
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          ctx.fillRect(bm.x + Math.cos(ang) * r - 1, bm.y + Math.sin(ang) * r - 1, 3, 3);
        }
      }
      ctx.fillStyle = '#7CFC00';
      for (const b of s.shots) ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#ff6b6b';
      for (const b of s.bombs) ctx.fillRect(b.x, b.y, b.w, b.h);
      if (s.inv <= 0 || Math.floor(s.inv * 10) % 2 === 0) {
        sprite(ctx, SHIP, s.ship.x, s.ship.y, 3, { 1: getSkin('starblaster')?.body || '#33ff66', 2: getSkin('starblaster')?.trim || '#ffffff' });
      }
      ctx.fillStyle = '#33ff66';
      ctx.fillRect(0, H - 12, W, 2);
      g.text(`WAVE ${s.wave}`, 8, 14, 7, '#a29bfe', 'left');
    },
  });

  function fire(g) {
    const s = g.s;
    if (s.cool > 0 || s.shots.length >= 3) return;
    s.cool = 0.28;
    s.shots.push({ x: s.ship.x + s.ship.w / 2 - 1, y: s.ship.y - 6, w: 3, h: 9 });
    emit('shoot', s.ship.x + s.ship.w / 2, s.ship.y);
  }

  function shipHit(g) {
    const s = g.s;
    s.booms.push({ x: s.ship.x + 13, y: s.ship.y + 8, t: 0.3, c: '#33ff66' });
    emit('boom', s.ship.x + 13, s.ship.y + 8, { color: '#33ff66', scale: 1.2 });
    if (!g.hit()) s.inv = 2;
  }

  function nextWave(g) {
    const s = g.s;
    s.wave += 1;
    s.aliens = [];
    const cols = 8;
    const top = 30 + Math.min(4, s.wave - 1) * 10;
    ROWS_DEF.forEach((rd, r) => {
      for (let c = 0; c < cols; c++) {
        s.aliens.push({ x: 24 + c * 34, y: top + r * 26, w: 24, h: 18, art: rd.art, color: rd.color, pts: rd.pts, dead: false });
      }
    });
    s.total = s.aliens.length;
    s.baseSpeed = 18 + s.wave * 6;
    s.dir = 1;
    s.anim = 0;
    s.bombT = 1.5;
    s.shots = []; s.bombs = [];
    g.note(`Wave ${s.wave}`);
  }
}
