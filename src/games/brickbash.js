import { makeGame, rand, overlap, clamp } from './kit.js';
import { emit } from '../fx.js';

const W = 320, H = 400;
const COLS = 10, BW = 30, BH = 12, TOP = 48;
const ROW_COLORS = ['#ff4d6d', '#e17055', '#fdcb6e', '#33ff66', '#74b9ff', '#a29bfe'];
const POWERS = {
  W: { color: '#74b9ff', label: 'W' }, // wide paddle
  M: { color: '#fdcb6e', label: 'M' }, // multiball
  S: { color: '#33ff66', label: 'S' }, // slow ball
  L: { color: '#ff4d6d', label: '+' }, // extra life
};
const LAYOUTS = [
  (r, c) => true,
  (r, c) => (r + c) % 2 === 0 || r === 0,
  (r, c) => c > r - 1 && c < COLS - r + 1 || r < 2,
  (r, c) => c !== 4 && c !== 5 || r % 2 === 0,
];

export function createBrickBash(canvas, hooks) {
  return makeGame(canvas, hooks, {
    id: 'brickbash', W, H,
    avatar: (g) => g.s.paddle && { x: g.s.paddle.x + g.s.paddle.w / 2, y: g.s.paddle.y + g.s.paddle.h / 2, h: -Math.PI / 2 },
    init(g) {
      const s = g.s;
      s.level = 0;
      s.paddle = { x: W / 2 - 28, y: H - 28, w: 56, h: 8 };
      s.wide = 0; s.slow = 0;
      g.setLives(3);
      nextLevel(g);
    },
    press(name, g) {
      if (name === 'action' || name === 'up') launch(g);
    },
    update(dt, g) {
      const s = g.s, p = s.paddle;
      s.wide -= dt; s.slow -= dt;
      const targetW = s.wide > 0 ? 88 : 56;
      if (p.w !== targetW) { const cx = p.x + p.w / 2; p.w = targetW; p.x = cx - p.w / 2; }
      if (g.held('left')) p.x -= 240 * dt;
      if (g.held('right')) p.x += 240 * dt;
      p.x = clamp(p.x, 2, W - p.w - 2);

      const spdMul = s.slow > 0 ? 0.65 : 1;
      for (const b of s.balls) {
        if (b.stuck) { b.x = p.x + p.w / 2 - 3; b.y = p.y - 7; continue; }
        // sub-steps to avoid tunnelling
        const steps = 3;
        for (let i = 0; i < steps; i++) {
          b.x += (b.vx * spdMul * dt) / steps;
          b.y += (b.vy * spdMul * dt) / steps;
          if (b.x < 2) { b.x = 2; b.vx = Math.abs(b.vx); g.sfx.move(); }
          if (b.x + b.w > W - 2) { b.x = W - 2 - b.w; b.vx = -Math.abs(b.vx); g.sfx.move(); }
          if (b.y < 26) { b.y = 26; b.vy = Math.abs(b.vy); g.sfx.move(); }
          if (b.vy > 0 && overlap(b, p)) {
            const rel = (b.x + b.w / 2 - (p.x + p.w / 2)) / (p.w / 2);
            const sp = Math.hypot(b.vx, b.vy);
            const ang = clamp(rel, -1, 1) * 1.05;
            b.vx = Math.sin(ang) * sp;
            b.vy = -Math.cos(ang) * sp;
            b.y = p.y - b.h;
            emit('bounce', b.x, b.y);
          }
          for (const br of s.bricks) {
            if (br.dead || !overlap(b, br)) continue;
            br.hp -= 1;
            const ox = Math.min(b.x + b.w - br.x, br.x + br.w - b.x);
            const oy = Math.min(b.y + b.h - br.y, br.y + br.h - b.y);
            if (ox < oy) b.vx = -b.vx; else b.vy = -b.vy;
            if (br.hp <= 0) {
              br.dead = true;
              g.add(br.pts);
              emit('brick', br.x + br.w / 2, br.y + br.h / 2, { color: br.color });
              if (Math.random() < 0.16) {
                const keys = Object.keys(POWERS);
                s.caps.push({ x: br.x + 7, y: br.y, w: 16, h: 9, kind: keys[(Math.random() * keys.length) | 0] });
              }
            } else g.sfx.click();
            // speed up slowly
            const sp = Math.hypot(b.vx, b.vy);
            if (sp < 330) { b.vx *= 1.01; b.vy *= 1.01; }
            break;
          }
        }
        if (b.y > H) b.dead = true;
      }
      s.balls = s.balls.filter((b) => !b.dead);

      for (const c of s.caps) {
        c.y += 90 * dt;
        if (overlap(c, p)) {
          c.dead = true;
          emit('powerup', c.x + c.w / 2, c.y);
          g.flash('eat');
          if (c.kind === 'W') { s.wide = 12; g.note('Wide paddle!'); }
          if (c.kind === 'S') { s.slow = 9; g.note('Slow ball!'); }
          if (c.kind === 'L') { g.setLives(g.lives + 1); g.note('Extra life!'); }
          if (c.kind === 'M') {
            const src = s.balls.find((b) => !b.stuck) || s.balls[0];
            if (src) {
              for (const a of [-0.5, 0.5]) {
                const sp = Math.hypot(src.vx, src.vy) || 200;
                s.balls.push({ x: src.x, y: src.y, w: 6, h: 6, vx: Math.sin(a) * sp, vy: -Math.cos(a) * sp, stuck: false });
              }
            }
            g.note('Multiball!');
          }
        }
        if (c.y > H) c.dead = true;
      }
      s.caps = s.caps.filter((c) => !c.dead);

      if (!s.balls.length) {
        emit('hit', p.x + p.w / 2, p.y, { sound: 'hit' });
        if (!g.hit()) { s.wide = 0; s.slow = 0; s.caps = []; serve(g); }
        return;
      }
      if (s.bricks.every((b) => b.dead || b.hp > 9)) {
        g.add(250 * s.level);
        emit('clear', W / 2, H / 3);
        g.flash('clear');
        nextLevel(g);
      }
    },
    draw(ctx, g) {
      const s = g.s;
      ctx.fillStyle = '#0b0b22';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1b1b3a';
      for (let y = 26; y < H; y += 16) for (let x = (y / 16) % 2 ? 0 : 8; x < W; x += 16) ctx.fillRect(x, y, 2, 2);
      ctx.fillStyle = '#5a6a7a';
      ctx.fillRect(0, 22, W, 4);
      ctx.fillRect(0, 22, 2, H);
      ctx.fillRect(W - 2, 22, 2, H);
      for (const br of s.bricks) {
        if (br.dead) continue;
        ctx.fillStyle = br.hp > 1 ? '#dfe6e9' : br.color;
        ctx.fillRect(br.x, br.y, br.w, br.h);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(br.x, br.y, br.w, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(br.x, br.y + br.h - 2, br.w, 2);
      }
      for (const c of s.caps) {
        ctx.fillStyle = POWERS[c.kind].color;
        ctx.fillRect(c.x, c.y, c.w, c.h);
        g.text(POWERS[c.kind].label, c.x + c.w / 2, c.y + 8, 6, '#111');
      }
      const p = s.paddle;
      ctx.fillStyle = s.wide > 0 ? '#74b9ff' : '#d4c4a8';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(p.x, p.y, 6, p.h);
      ctx.fillRect(p.x + p.w - 6, p.y, 6, p.h);
      ctx.fillStyle = s.slow > 0 ? '#33ff66' : '#ffffff';
      for (const b of s.balls) ctx.fillRect(b.x | 0, b.y | 0, b.w, b.h);
      g.text(`LEVEL ${s.level}`, 8, 15, 7, '#a29bfe', 'left');
      if (s.balls.some((b) => b.stuck)) g.text('SPACE / ● TO LAUNCH', W / 2, H - 50, 7, '#ffeaa7');
    },
  });

  function serve(g) {
    const s = g.s;
    s.balls = [{ x: 0, y: 0, w: 6, h: 6, vx: 0, vy: 0, stuck: true }];
  }

  function launch(g) {
    for (const b of g.s.balls) {
      if (!b.stuck) continue;
      b.stuck = false;
      const sp = 210 + g.s.level * 15;
      const a = rand(-0.5, 0.5);
      b.vx = Math.sin(a) * sp;
      b.vy = -Math.cos(a) * sp;
      g.sfx.blip();
    }
  }

  function nextLevel(g) {
    const s = g.s;
    s.level += 1;
    const layout = LAYOUTS[(s.level - 1) % LAYOUTS.length];
    s.bricks = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!layout(r, c)) continue;
        const tough = s.level > 1 && r === 0;
        s.bricks.push({ x: 10 + c * BW + 1, y: TOP + r * (BH + 3), w: BW - 2, h: BH, color: ROW_COLORS[r], pts: (6 - r) * 10, hp: tough ? 2 : 1, dead: false });
      }
    }
    s.caps = [];
    serve(g);
    g.note(`Level ${s.level}`);
  }
}
