import { makeGame, rand, randi, overlap, clamp } from './kit.js';
import { emit } from '../fx.js';

const W = 320, H = 420;
const RL = 40, RR = 280, LANES = 4, LW = (RR - RL) / LANES;
const COLORS = ['#ff4d6d', '#fdcb6e', '#74b9ff', '#a29bfe', '#00cec9', '#e17055'];

function drawCar(ctx, x, y, w, h, body, glow) {
  ctx.fillStyle = glow;
  ctx.fillRect(x - 2, y + 4, w + 4, h - 8);
  ctx.fillStyle = body;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 3, y + 6, 3, 10); ctx.fillRect(x + w, y + 6, 3, 10);
  ctx.fillRect(x - 3, y + h - 16, 3, 10); ctx.fillRect(x + w, y + h - 16, 3, 10);
  ctx.fillStyle = '#0b0b22';
  ctx.fillRect(x + 4, y + 10, w - 8, 8);
  ctx.fillRect(x + 4, y + h - 14, w - 8, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x + 2, y + 2, w - 4, 2);
}

export function createNeonRacer(canvas, hooks) {
  return makeGame(canvas, hooks, {
    id: 'neonracer', W, H,
    avatar: (g) => g.s.car && { x: g.s.car.x + g.s.car.w / 2, y: g.s.car.y + g.s.car.h / 2, h: -Math.PI / 2 },
    init(g) {
      const s = g.s;
      s.car = { x: RL + LW * 1.5 - 13, y: H - 74, w: 26, h: 44 };
      s.base = 220; s.speed = 220; s.scroll = 0; s.dist = 0;
      s.traffic = []; s.spawnT = 0.8; s.inv = 0; s.acc = 0;
      g.setLives(3);
    },
    update(dt, g) {
      const s = g.s, car = s.car;
      s.base = Math.min(520, s.base + 6 * dt);
      let target = s.base;
      if (g.held('up') || g.held('action')) target *= 1.35;
      if (g.held('down')) target *= 0.6;
      s.speed += (target - s.speed) * Math.min(1, dt * 3);
      let mx = 0;
      if (g.held('left')) mx -= 1;
      if (g.held('right')) mx += 1;
      car.x = clamp(car.x + mx * 210 * dt, RL + 3, RR - car.w - 3);
      s.tilt = mx;
      s.scroll = (s.scroll + s.speed * dt) % 40;
      s.inv -= dt;

      s.acc += s.speed * dt * (s.speed > s.base * 1.2 ? 1.5 : 1);
      while (s.acc >= 40) { s.acc -= 40; g.add(1); }

      s.spawnT -= dt;
      if (s.spawnT <= 0) {
        s.spawnT = Math.max(0.35, 1.1 - s.base / 900) * rand(0.6, 1.3);
        const lane = randi(0, LANES - 1);
        const x = RL + lane * LW + LW / 2 - 12;
        if (!s.traffic.some((t) => t.y < 40 && Math.abs(t.x - x) < 30)) {
          s.traffic.push({ x, y: -60, w: 24, h: 42, v: rand(90, 170), color: COLORS[randi(0, COLORS.length - 1)], shift: s.base > 300 && Math.random() < 0.25 ? (Math.random() < 0.5 ? -1 : 1) : 0 });
        }
      }
      for (const t of s.traffic) {
        t.y += (s.speed - t.v) * dt;
        if (t.shift && t.y > 40 && t.y < 200) {
          t.x = clamp(t.x + t.shift * 40 * dt, RL + 4, RR - t.w - 4);
        }
        if (!t.passed && t.y > car.y + car.h) { t.passed = true; g.add(20); g.sfx.move(); }
        if (s.inv <= 0 && overlap({ x: car.x + 2, y: car.y + 2, w: car.w - 4, h: car.h - 4 }, t)) {
          t.dead = true;
          emit('boom', car.x + car.w / 2, car.y, { scale: 1.1 });
          if (!g.hit()) { s.inv = 2; s.speed *= 0.5; s.base = Math.max(220, s.base * 0.85); }
          return;
        }
      }
      s.traffic = s.traffic.filter((t) => !t.dead && t.y < H + 60 && t.y > -200);
    },
    draw(ctx, g) {
      const s = g.s;
      ctx.fillStyle = '#12001f';
      ctx.fillRect(0, 0, W, H);
      // side neon grid
      ctx.fillStyle = '#3a0a5a';
      for (let y = -40 + s.scroll; y < H; y += 40) { ctx.fillRect(0, y | 0, RL - 6, 2); ctx.fillRect(RR + 6, y | 0, W - RR - 6, 2); }
      for (let x = 6; x < RL - 6; x += 12) ctx.fillRect(x, 0, 2, H);
      for (let x = RR + 10; x < W; x += 12) ctx.fillRect(x, 0, 2, H);
      // road
      ctx.fillStyle = '#0b0b16';
      ctx.fillRect(RL, 0, RR - RL, H);
      ctx.fillStyle = '#ff2fd0';
      ctx.fillRect(RL - 4, 0, 4, H); ctx.fillRect(RR, 0, 4, H);
      ctx.fillStyle = '#00f0ff';
      for (let l = 1; l < LANES; l++) {
        for (let y = -40 + s.scroll; y < H; y += 40) ctx.fillRect(RL + l * LW - 1, y | 0, 3, 18);
      }
      for (const t of s.traffic) drawCar(ctx, t.x, t.y | 0, t.w, t.h, t.color, 'rgba(255,255,255,0.08)');
      const car = s.car;
      if (s.inv <= 0 || Math.floor(s.inv * 10) % 2 === 0) {
        drawCar(ctx, car.x | 0, car.y, car.w, car.h, '#33ff66', 'rgba(51,255,102,0.25)');
        if (g.held('up') || g.held('action')) {
          ctx.fillStyle = Math.random() > 0.5 ? '#ff4d6d' : '#fdcb6e';
          ctx.fillRect(car.x + 6, car.y + car.h, 4, 6); ctx.fillRect(car.x + car.w - 10, car.y + car.h, 4, 6);
        }
      }
      g.text(`${Math.round(s.speed * 0.5)} KM/H`, W - 6, 16, 7, '#00f0ff', 'right');
    },
  });
}
