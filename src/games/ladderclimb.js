import { makeGame, sprite, clamp, overlap } from './kit.js';
import { emit } from '../fx.js';

const W = 320, H = 400;
const FLOOR_Y = [384, 316, 248, 180, 112, 52];
const SPANS = [[0, W], [0, W - 40], [40, W], [0, W - 40], [40, W], [0, 150]];
const LADDERS = [ // { x, from, to }
  { x: 250, from: 0, to: 1 }, { x: 120, from: 0, to: 1 },
  { x: 70, from: 1, to: 2 }, { x: 200, from: 1, to: 2 },
  { x: 240, from: 2, to: 3 },
  { x: 80, from: 3, to: 4 }, { x: 180, from: 3, to: 4 },
  { x: 110, from: 4, to: 5 },
];
const rollDir = (f) => (f % 2 === 0 ? -1 : 1);
const HERO = ['.1111.', '.2222.', '.2332.', '444444', '.4444.', '.5..5.', '55..55'];
const HERO_PAL = { 1: '#ff4d6d', 2: '#f5d0a9', 3: '#111', 4: '#74b9ff', 5: '#3d2914' };

export function createLadderClimb(canvas, hooks) {
  return makeGame(canvas, hooks, {
    id: 'ladderclimb', W, H,
    init(g) {
      g.s.level = 1;
      g.setLives(3);
      startRound(g);
    },
    press(name, g) {
      const p = g.s.p;
      if (p.state !== 'ground') return;
      const nearUp = ladderAt(p, p.floor, 'up');
      if (name === 'action' || (name === 'up' && !nearUp)) {
        p.state = 'jump'; p.vy = -205; emit('jump', p.x + p.w / 2, p.y + p.h);
      }
    },
    update(dt, g) {
      const s = g.s, p = s.p;
      s.bonusT += dt;
      if (s.bonusT >= 2) { s.bonusT = 0; s.bonus = Math.max(0, s.bonus - 100); }
      if (s.dying > 0) { s.dying -= dt; if (s.dying <= 0 && !g.over) startRound(g, true); return; }

      // player
      let mx = 0;
      if (g.held('left')) mx -= 1;
      if (g.held('right')) mx += 1;
      if (mx) p.face = mx;
      if (p.state === 'ground') {
        p.x += mx * 85 * dt;
        const span = SPANS[p.floor];
        p.x = clamp(p.x, span[0] + 2, span[1] - p.w - 2);
        p.y = FLOOR_Y[p.floor] - p.h;
        p.walk += mx ? dt : 0;
        const up = g.held('up') && ladderAt(p, p.floor, 'up');
        const down = g.held('down') && ladderAt(p, p.floor, 'down');
        if (up) { p.state = 'ladder'; p.ladder = up; p.x = up.x - p.w / 2; }
        else if (down) { p.state = 'ladder'; p.ladder = down; p.x = down.x - p.w / 2; }
      } else if (p.state === 'ladder') {
        const L = p.ladder;
        let my = 0;
        if (g.held('up')) my -= 1;
        if (g.held('down')) my += 1;
        p.y += my * 65 * dt;
        p.walk += my ? dt : 0;
        const topY = FLOOR_Y[L.to] - p.h, botY = FLOOR_Y[L.from] - p.h;
        if (p.y <= topY) { p.y = topY; p.floor = L.to; p.state = 'ground'; if (L.to === 5) return win(g); if (L.to > s.best) { s.best = L.to; g.add(50); } }
        else if (p.y >= botY) { p.y = botY; p.floor = L.from; p.state = 'ground'; }
      } else if (p.state === 'jump') {
        p.x += mx * 85 * dt;
        const span = SPANS[p.floor];
        p.x = clamp(p.x, span[0] + 2, span[1] - p.w - 2);
        p.vy += 620 * dt;
        p.y += p.vy * dt;
        const ground = FLOOR_Y[p.floor] - p.h;
        if (p.y >= ground) { p.y = ground; p.state = 'ground'; p.vy = 0; }
      }

      // barrels
      s.spawnT -= dt;
      if (s.spawnT <= 0) {
        s.spawnT = Math.max(1.1, 2.8 - s.level * 0.25) * (0.7 + Math.random() * 0.6);
        s.barrels.push({ x: W - 30, y: FLOOR_Y[4] - 14, w: 14, h: 14, floor: 4, dir: -1, state: 'roll', vy: 0, rot: 0 });
      }
      const speed = 75 + s.level * 12;
      for (const b of s.barrels) {
        b.rot += b.dir * dt * 8;
        if (b.state === 'roll') {
          const prevC = b.x + b.w / 2;
          b.x += b.dir * speed * dt;
          const curC = b.x + b.w / 2;
          b.y = FLOOR_Y[b.floor] - b.h;
          const span = SPANS[b.floor];
          if (b.floor === 0 && (b.x < -20 || b.x > W + 20)) b.dead = true;
          else if (b.floor > 0 && (b.x + b.w / 2 < span[0] || b.x + b.w / 2 > span[1])) { b.state = 'fall'; b.vy = 30; }
          else {
            const L = LADDERS.find((l) => l.to === b.floor && (l.x - prevC) * (l.x - curC) <= 0);
            if (L && L !== b.lastL) {
              b.lastL = L;
              if (Math.random() < 0.28 + s.level * 0.03) { b.state = 'ladder'; b.ladder = L; b.x = L.x - b.w / 2; }
            }
          }
        } else if (b.state === 'fall') {
          b.vy += 600 * dt; b.y += b.vy * dt;
          const next = b.floor - 1;
          if (b.y >= FLOOR_Y[next] - b.h) { b.floor = next; b.dir = rollDir(next); b.state = 'roll'; g.sfx.drop(); }
        } else if (b.state === 'ladder') {
          b.y += 70 * dt;
          const target = FLOOR_Y[b.ladder.from] - b.h;
          if (b.y >= target) { b.floor = b.ladder.from; b.dir = rollDir(b.floor); b.state = 'roll'; }
        }
        // collision / jump bonus
        const hb = { x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 2 };
        const bb = { x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 4 };
        if (overlap(hb, bb)) { die(g); return; }
        if (p.state === 'jump' && !b.jumped && b.floor === p.floor && Math.abs(b.x + b.w / 2 - (p.x + p.w / 2)) < 10 && p.y + p.h < b.y + 2) {
          b.jumped = true; g.add(100); emit('coin', b.x + b.w / 2, b.y); g.flash('eat');
        }
      }
      s.barrels = s.barrels.filter((b) => !b.dead);
    },
    draw(ctx, g) {
      const s = g.s;
      ctx.fillStyle = '#0a0814';
      ctx.fillRect(0, 0, W, H);
      // ladders
      for (const L of LADDERS) {
        const top = FLOOR_Y[L.to], bot = FLOOR_Y[L.from];
        ctx.fillStyle = '#00cec9';
        ctx.fillRect(L.x - 8, top, 2, bot - top);
        ctx.fillRect(L.x + 6, top, 2, bot - top);
        for (let y = top + 6; y < bot; y += 8) ctx.fillRect(L.x - 8, y, 16, 2);
      }
      // girders
      SPANS.forEach(([a, b], f) => {
        const y = FLOOR_Y[f];
        ctx.fillStyle = '#e94560';
        ctx.fillRect(a, y, b - a, 8);
        ctx.fillStyle = '#7a1a30';
        for (let x = a; x < b - 4; x += 12) { ctx.fillRect(x + 2, y + 2, 4, 4); }
        ctx.fillStyle = '#ff8fa3';
        ctx.fillRect(a, y, b - a, 1);
      });
      // chute + goal
      ctx.fillStyle = '#5a6a7a';
      ctx.fillRect(W - 40, FLOOR_Y[4] - 44, 30, 30);
      ctx.fillStyle = '#111';
      ctx.fillRect(W - 36, FLOOR_Y[4] - 22, 22, 8);
      const tw = Math.floor(g.t * 4) % 2;
      sprite(ctx, ['..1..', '.111.', '11111', '.111.', '1.1.1'], 30, FLOOR_Y[5] - 24, 4, { 1: tw ? '#ffeaa7' : '#fdcb6e' });
      g.text('GOAL', 40, FLOOR_Y[5] - 28, 6, '#ffeaa7');
      // barrels
      for (const b of s.barrels) {
        const cx = b.x + 7, cy = b.y + 7;
        ctx.fillStyle = '#b5651d';
        ctx.fillRect(b.x + 2, b.y, 10, 14); ctx.fillRect(b.x, b.y + 2, 14, 10);
        ctx.fillStyle = '#5c3d1e';
        const o = Math.round(Math.sin(b.rot) * 4);
        ctx.fillRect(cx - 1 + o, b.y + 1, 2, 12);
        ctx.fillRect(b.x + 1, cy - 1, 12, 2);
      }
      // hero
      const p = s.p;
      if (s.dying > 0) {
        if (Math.floor(s.dying * 10) % 2) sprite(ctx, HERO, p.x, p.y + 2, 2, { ...HERO_PAL, 4: '#ff4d6d' });
      } else {
        let art = HERO;
        if (p.state !== 'jump' && Math.floor(p.walk * 8) % 2) art = HERO.slice(0, 5).concat(['5....5', '5....5']);
        if (p.face < 0) art = art.map((r) => r.split('').reverse().join(''));
        sprite(ctx, art, p.x, p.y + 2, 2, HERO_PAL);
      }
      g.text(`LVL ${s.level}`, 8, 16, 7, '#a29bfe', 'left');
      g.text(`BONUS ${s.bonus}`, W - 8, 16, 7, '#ffeaa7', 'right');
    },
  });

  function ladderAt(p, floor, dir) {
    const cx = p.x + p.w / 2;
    return LADDERS.find((l) => Math.abs(l.x - cx) < 8 && (dir === 'up' ? l.from === floor : l.to === floor)) || null;
  }

  function startRound(g, keepBonus) {
    const s = g.s;
    s.p = { x: 24, y: FLOOR_Y[0] - 14, w: 12, h: 14, floor: 0, state: 'ground', vy: 0, face: 1, walk: 0, ladder: null };
    s.barrels = [];
    s.spawnT = 1.2;
    s.dying = 0;
    s.best = 0;
    if (!keepBonus) { s.bonus = 3000; s.bonusT = 0; }
  }

  function die(g) {
    g.s.dying = 1;
    emit('hit', g.s.p.x + g.s.p.w / 2, g.s.p.y + g.s.p.h / 2);
    if (!g.hit()) g.note('Bonk!');
  }

  function win(g) {
    const s = g.s;
    g.add(1000 + s.bonus);
    emit('level', W / 2, H / 4);
    g.flash('clear');
    s.level += 1;
    g.note(`Level ${s.level}`);
    startRound(g);
  }
}
