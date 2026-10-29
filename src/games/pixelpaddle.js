import { makeGame, clamp, rand } from './kit.js';

const W = 320, H = 256, PH = 40, PW = 6, WIN = 7;

export function createPixelPaddle(canvas, hooks) {
  return makeGame(canvas, hooks, {
    id: 'pixelpaddle', W, H,
    extraKeys: ['Digit1', 'Digit2', 'Numpad1', 'Numpad2'],
    init(g) {
      const s = g.s;
      s.mode = null; s.sel = 0;
      s.left = { x: 12, y: H / 2 - PH / 2, pts: 0 };
      s.right = { x: W - 12 - PW, y: H / 2 - PH / 2, pts: 0 };
      s.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
      s.wait = 0; s.rally = 0;
      g.status('Choose mode');
    },
    press(name, g, code) {
      const s = g.s;
      if (s.mode) return;
      if (code === 'Digit1' || code === 'Numpad1') return choose(g, 1);
      if (code === 'Digit2' || code === 'Numpad2') return choose(g, 2);
      if (name === 'up' || name === 'down') { s.sel = 1 - s.sel; g.sfx.move(); }
      if (name === 'action' || name === 'left' || name === 'right') choose(g, s.sel + 1);
    },
    update(dt, g) {
      const s = g.s;
      if (!s.mode) return;
      const L = s.left, R = s.right, b = s.ball;
      const pSpeed = 230;
      if (s.mode === 1) {
        let d = 0;
        if (g.held('up')) d -= 1;
        if (g.held('down')) d += 1;
        L.y += d * pSpeed * dt;
        // CPU: tracks the ball with a capped speed and a small aim error
        const target = b.vx > 0 ? b.y - PH / 2 + s.cpuErr : H / 2 - PH / 2;
        const cpuSpeed = 150 + Math.min(80, s.rally * 4);
        R.y += clamp(target - R.y, -cpuSpeed * dt, cpuSpeed * dt);
      } else {
        let d1 = 0, d2 = 0;
        if (g.rawHeld('KeyW') || g.padHeld('up')) d1 -= 1;
        if (g.rawHeld('KeyS') || g.padHeld('down')) d1 += 1;
        if (g.rawHeld('ArrowUp')) d2 -= 1;
        if (g.rawHeld('ArrowDown')) d2 += 1;
        L.y += clamp(d1, -1, 1) * pSpeed * dt;
        R.y += d2 * pSpeed * dt;
      }
      L.y = clamp(L.y, 4, H - PH - 4);
      R.y = clamp(R.y, 4, H - PH - 4);

      if (s.wait > 0) {
        s.wait -= dt;
        if (s.wait <= 0) serve(g);
        return;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < 4) { b.y = 4; b.vy = Math.abs(b.vy); g.sfx.move(); }
      if (b.y > H - 10) { b.y = H - 10; b.vy = -Math.abs(b.vy); g.sfx.move(); }
      const hitPaddle = (P, dir) => {
        if (b.y + 6 < P.y || b.y > P.y + PH) return false;
        const rel = (b.y + 3 - (P.y + PH / 2)) / (PH / 2);
        const sp = Math.min(Math.hypot(b.vx, b.vy) * 1.06, 420);
        const ang = clamp(rel, -1, 1) * 0.9;
        b.vx = dir * Math.cos(ang) * sp;
        b.vy = Math.sin(ang) * sp;
        s.rally += 1;
        s.cpuErr = rand(-PH * 0.45, PH * 0.45);
        g.sfx.drop();
        return true;
      };
      if (b.vx < 0 && b.x <= L.x + PW && b.x >= L.x - 4) {
        if (hitPaddle(L, 1)) { b.x = L.x + PW; if (s.mode === 1) g.add(5); }
      }
      if (b.vx > 0 && b.x + 6 >= R.x && b.x <= R.x + PW + 4) {
        if (hitPaddle(R, -1)) b.x = R.x - 6;
      }
      if (b.x < -10) point(g, 'right');
      if (b.x > W + 10) point(g, 'left');
    },
    draw(ctx, g) {
      const s = g.s;
      ctx.fillStyle = '#081208';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1f3a1f';
      for (let y = 4; y < H; y += 16) ctx.fillRect(W / 2 - 2, y, 4, 8);
      ctx.fillStyle = '#33ff66';
      ctx.fillRect(0, 0, W, 3); ctx.fillRect(0, H - 3, W, 3);
      if (!s.mode) {
        g.text('PIXEL PADDLE', W / 2, 60, 12, '#33ff66');
        g.text(`FIRST TO ${WIN}`, W / 2, 84, 7, '#9a8f7a');
        const opts = ['1 PLAYER VS CPU', '2 PLAYERS'];
        opts.forEach((o, i) => g.text((s.sel === i ? '> ' : '  ') + o, W / 2, 130 + i * 26, 8, s.sel === i ? '#ffeaa7' : '#9a8f7a'));
        g.text('▲▼ choose · SPACE/● start', W / 2, 200, 6, '#9a8f7a');
        g.text('2P: W/S vs ↑/↓', W / 2, 220, 6, '#9a8f7a');
        return;
      }
      g.text(String(s.left.pts), W / 2 - 40, 34, 18, '#33ff66');
      g.text(String(s.right.pts), W / 2 + 40, 34, 18, '#33ff66');
      g.text(s.mode === 1 ? 'YOU' : 'P1', W / 2 - 40, 50, 6, '#9a8f7a');
      g.text(s.mode === 1 ? 'CPU' : 'P2', W / 2 + 40, 50, 6, '#9a8f7a');
      ctx.fillStyle = '#d4c4a8';
      ctx.fillRect(s.left.x, s.left.y | 0, PW, PH);
      ctx.fillRect(s.right.x, s.right.y | 0, PW, PH);
      if (s.wait <= 0 || Math.floor(s.wait * 8) % 2 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(s.ball.x | 0, s.ball.y | 0, 6, 6);
      }
    },
  });

  function choose(g, mode) {
    const s = g.s;
    s.mode = mode;
    g.noSave = mode === 2;
    g.extra(mode === 1 ? 'CPU' : 'P2', 0);
    g.sfx.select();
    g.status('Playing');
    s.server = Math.random() < 0.5 ? -1 : 1;
    s.wait = 0.8;
    s.cpuErr = 0;
  }

  function serve(g) {
    const s = g.s;
    s.ball = { x: W / 2 - 3, y: rand(H * 0.3, H * 0.7), vx: 0, vy: 0 };
    const a = rand(-0.5, 0.5);
    s.ball.vx = s.server * Math.cos(a) * 180;
    s.ball.vy = Math.sin(a) * 180;
    s.rally = 0;
  }

  function point(g, who) {
    const s = g.s;
    s[who].pts += 1;
    if (who === 'left') { if (s.mode === 1) g.add(100); else g.add(1); }
    g.extra(s.mode === 1 ? 'CPU' : 'P2', s.right.pts);
    g.sfx.eat();
    g.flash(who === 'left' ? 'eat' : 'die');
    s.server = who === 'left' ? 1 : -1;
    s.ball.vx = 0; s.ball.vy = 0; s.ball.x = W / 2; s.ball.y = H / 2;
    if (s[who].pts >= WIN) {
      if (s.mode === 1 && who === 'left') g.add(1000);
      const msg = s.mode === 1 ? (who === 'left' ? 'YOU WIN!' : 'CPU WINS') : (who === 'left' ? 'P1 WINS!' : 'P2 WINS!');
      g.gameOver(msg);
      return;
    }
    s.wait = 0.9;
  }
}
