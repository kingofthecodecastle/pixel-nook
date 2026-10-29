import { makeGame, rand, clamp } from './kit.js';

const W = 320, H = 400;

export function createMoonDrop(canvas, hooks) {
  return makeGame(canvas, hooks, {
    id: 'moondrop', W, H,
    init(g) {
      const s = g.s;
      s.level = 1;
      s.stars = Array.from({ length: 50 }, () => ({ x: rand(0, W), y: rand(0, H * 0.7), b: Math.random() }));
      s.parts = [];
      g.setLives(3);
      buildLevel(g);
    },
    update(dt, g) {
      const s = g.s, sh = s.ship;
      for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt; p.life -= dt; }
      s.parts = s.parts.filter((p) => p.life > 0);
      if (s.wait > 0) {
        s.wait -= dt;
        if (s.wait <= 0 && !g.over) { if (s.landed) { s.level += 1; buildLevel(g); } else resetShip(g); }
        return;
      }
      if (g.held('left')) sh.a -= 2.6 * dt;
      if (g.held('right')) sh.a += 2.6 * dt;
      sh.a = clamp(sh.a, -1.5, 1.5);
      sh.thrust = (g.held('up') || g.held('action')) && s.fuel > 0;
      if (sh.thrust) {
        sh.vx += Math.sin(sh.a) * 75 * dt;
        sh.vy -= Math.cos(sh.a) * 75 * dt;
        s.fuel = Math.max(0, s.fuel - 12 * dt);
        if (Math.random() < 0.6) s.parts.push({ x: sh.x - Math.sin(sh.a) * 9, y: sh.y + Math.cos(sh.a) * 9, vx: -Math.sin(sh.a) * 60 + rand(-15, 15), vy: Math.cos(sh.a) * 60, life: 0.35, c: Math.random() < 0.5 ? '#ff4d6d' : '#fdcb6e' });
        s.hum -= dt; if (s.hum <= 0) { s.hum = 0.12; g.sfx.move(); }
      }
      sh.vy += s.gravity * dt;
      sh.vx += s.wind * dt;
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      if (sh.x < 8) { sh.x = 8; sh.vx = Math.abs(sh.vx) * 0.5; }
      if (sh.x > W - 8) { sh.x = W - 8; sh.vx = -Math.abs(sh.vx) * 0.5; }
      if (sh.y < -60) sh.vy = Math.max(sh.vy, 0);

      // ground contact: check both legs and the nose
      const feet = [sh.x - 7, sh.x + 7].map((x) => ({ x, y: sh.y + 8 }));
      const touching = feet.some((f) => f.y >= groundAt(s, f.x)) || sh.y - 8 >= groundAt(s, sh.x);
      if (touching) {
        const onPad = feet.every((f) => f.x >= s.pad.x && f.x <= s.pad.x + s.pad.w);
        const soft = sh.vy < 38 && Math.abs(sh.vx) < 24 && Math.abs(sh.a) < 0.28;
        if (onPad && soft) {
          sh.y = s.pad.y - 8; sh.vx = sh.vy = 0; sh.thrust = false;
          const pts = (100 + Math.round(s.fuel) * 2) * s.pad.mult;
          g.add(pts);
          g.sfx.level();
          g.flash('clear');
          g.note(`Landed! +${pts}`);
          s.landed = true; s.wait = 1.6;
        } else {
          for (let i = 0; i < 24; i++) { const a = rand(0, 6.28), v = rand(20, 110); s.parts.push({ x: sh.x, y: sh.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: rand(0.4, 1), c: i % 2 ? '#d4c4a8' : '#ff4d6d' }); }
          s.crashed = true; s.landed = false; s.wait = 1.4;
          g.hit();
        }
      }
    },
    draw(ctx, g) {
      const s = g.s, sh = s.ship;
      ctx.fillStyle = '#04040f';
      ctx.fillRect(0, 0, W, H);
      for (const st of s.stars) { ctx.fillStyle = st.b > 0.75 ? '#d4c4a8' : '#3a3a5a'; ctx.fillRect(st.x | 0, st.y | 0, 2, 2); }
      // planet in the sky
      ctx.fillStyle = '#1f3a6a'; ctx.fillRect(250, 40, 36, 36); ctx.fillStyle = '#2e5aa0'; ctx.fillRect(254, 44, 20, 12);
      // terrain
      ctx.fillStyle = '#2a2a3a';
      ctx.beginPath(); ctx.moveTo(0, H);
      for (const p of s.ground) ctx.lineTo(p.x, p.y);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#9a8f7a'; ctx.lineWidth = 2;
      ctx.beginPath(); s.ground.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      // pad
      const blink = Math.floor(g.t * 3) % 2;
      ctx.fillStyle = blink ? '#33ff66' : '#7CFC00';
      ctx.fillRect(s.pad.x, s.pad.y, s.pad.w, 4);
      ctx.fillStyle = '#ffeaa7'; ctx.fillRect(s.pad.x, s.pad.y - 6, 2, 6); ctx.fillRect(s.pad.x + s.pad.w - 2, s.pad.y - 6, 2, 6);
      g.text(`x${s.pad.mult}`, s.pad.x + s.pad.w / 2, s.pad.y + 16, 7, '#33ff66');
      for (const p of s.parts) { ctx.fillStyle = p.c; ctx.fillRect(p.x | 0, p.y | 0, 2, 2); }
      // ship
      if (!s.crashed) {
        ctx.save(); ctx.translate(Math.round(sh.x), Math.round(sh.y)); ctx.rotate(sh.a);
        ctx.fillStyle = '#dfe6e9'; ctx.fillRect(-6, -8, 12, 10);
        ctx.fillStyle = '#74b9ff'; ctx.fillRect(-3, -6, 6, 4);
        ctx.fillStyle = '#fdcb6e'; ctx.fillRect(-8, 2, 16, 3);
        ctx.fillStyle = '#9a8f7a'; ctx.fillRect(-8, 5, 2, 3); ctx.fillRect(6, 5, 2, 3); ctx.fillRect(-2, 5, 4, 2);
        if (sh.thrust && Math.random() > 0.25) { ctx.fillStyle = '#ff4d6d'; ctx.fillRect(-2, 7, 4, 4 + ((Math.random() * 5) | 0)); }
        ctx.restore();
      }
      // instruments
      g.text(`LVL ${s.level}`, 8, 14, 7, '#a29bfe', 'left');
      ctx.fillStyle = '#000'; ctx.fillRect(8, 22, 82, 8);
      ctx.fillStyle = s.fuel > s.maxFuel * 0.25 ? '#fdcb6e' : '#ff4d6d';
      ctx.fillRect(9, 23, 80 * (s.fuel / s.maxFuel), 6);
      g.text('FUEL', 96, 30, 6, '#9a8f7a', 'left');
      const vOk = sh.vy < 38, hOk = Math.abs(sh.vx) < 24;
      g.text(`V ${Math.round(sh.vy)}`, W - 8, 14, 7, vOk ? '#33ff66' : '#ff4d6d', 'right');
      g.text(`H ${Math.round(sh.vx)}`, W - 8, 28, 7, hOk ? '#33ff66' : '#ff4d6d', 'right');
      if (s.wind) g.text(`WIND ${s.wind > 0 ? '>' : '<'}`, W / 2, 14, 6, '#74b9ff');
    },
  });

  function groundAt(s, x) {
    const gr = s.ground;
    for (let i = 1; i < gr.length; i++) {
      if (x <= gr[i].x) {
        const a = gr[i - 1], b = gr[i];
        return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1);
      }
    }
    return gr[gr.length - 1].y;
  }

  function buildLevel(g) {
    const s = g.s, L = s.level;
    s.gravity = 22 + Math.min(L, 8) * 3;
    s.wind = L >= 3 ? rand(-1, 1) * Math.min(12, (L - 2) * 3) : 0;
    s.maxFuel = Math.max(50, 100 - (L - 1) * 6);
    const padW = Math.max(26, 60 - (L - 1) * 5);
    const padX = rand(20, W - padW - 20);
    const padY = rand(H - 110, H - 40);
    s.pad = { x: padX, y: padY, w: padW, mult: padW < 34 ? 3 : padW < 48 ? 2 : 1 };
    const pts = [];
    const roughness = 30 + L * 6;
    let y = rand(H - 120, H - 30);
    for (let x = 0; x <= W; x += 16) {
      if (x >= padX - 4 && x <= padX + padW + 4) continue;
      y = clamp(y + rand(-roughness, roughness), H * 0.45, H - 14);
      pts.push({ x, y });
    }
    pts.push({ x: padX, y: padY }, { x: padX + padW, y: padY });
    pts.sort((a, b) => a.x - b.x);
    s.ground = pts;
    g.note(`Level ${L}`);
    resetShip(g);
  }

  function resetShip(g) {
    const s = g.s;
    const fromLeft = s.pad.x > W / 2;
    s.ship = { x: fromLeft ? 40 : W - 40, y: 50, vx: fromLeft ? 18 : -18, vy: 0, a: 0, thrust: false };
    s.fuel = s.maxFuel;
    s.landed = false; s.crashed = false; s.wait = 0; s.hum = 0;
  }
}
