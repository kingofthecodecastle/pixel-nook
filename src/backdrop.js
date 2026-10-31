// Animated retro backdrop behind the in-game board (all carts): a 2D canvas layer that fills the play frame.
// The 3D board view renders with a transparent clear colour on top of it, so the board floats over the scene.
// Backgrounds: SUNSET (synthwave sun, wireframe mountains, scrolling grid), SPACE, CITY, OFF (plain dark).
// Static layers are cached per size; only cheap moving parts are drawn per frame (~30 fps).
// Low quality tier or prefers-reduced-motion: drawn once, no animation.
import { getTier, onTier } from './three/quality.js';

export const BG_LIST = ['sunset', 'space', 'city', 'off'];
export const BG_LABEL = { sunset: 'SUNSET', space: 'SPACE', city: 'CITY', off: 'OFF' };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

export function createBackdrop(frame, getBoard) {
  const cv = document.createElement('canvas');
  cv.className = 'bg-layer';
  cv.setAttribute('aria-hidden', 'true');
  frame.prepend(cv);
  const g = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let name = 'off', raf = 0, last = 0, t0 = performance.now(), cache = null, cacheKey = '', alive = true;
  let W = 0, H = 0, S = 1, board = null;

  const animated = () => !reduce && getTier() !== 'low';
  function measure() {
    const r = cv.getBoundingClientRect();
    const s = getTier() === 'high' ? Math.min(1.25, window.devicePixelRatio || 1) : getTier() === 'mid' ? 0.75 : 0.6;
    const w = Math.max(2, Math.round(r.width * s)), h = Math.max(2, Math.round(r.height * s));
    const els = getBoard?.() || {};
    const b = els.board?.getBoundingClientRect?.(), st = els.stage?.getBoundingClientRect?.();
    board = b && b.width > 4 ? { x: (b.left - r.left) * s, y: (b.top - r.top) * s, w: b.width * s, h: b.height * s } : { x: w * 0.25, y: h * 0.15, w: w * 0.5, h: h * 0.7 };
    // free room beside the board inside the stage (the side panel covers the rest on wide layouts)
    board.gapL = Math.max(0, board.x);
    board.gapR = Math.max(0, (st && st.width > 4 ? (st.right - r.left) * s : w) - board.x - board.w);
    if (w !== W || h !== H) { W = w; H = h; cv.width = w; cv.height = h; }
    S = s;
    const key = `${name}|${W}|${H}|${Math.round(board.x / 8)}|${Math.round(board.w / 8)}|${Math.round(board.gapR / 8)}`;
    if (key !== cacheKey) { cacheKey = key; cache = BUILD[name]?.(); }
  }

  // ———————————————————— SUNSET ————————————————————
  function sunsetLayout() {
    const hy = Math.round(H * 0.6);
    const { gapL, gapR } = board;
    const r = Math.max(26, Math.min(H * 0.17, Math.max(gapL, gapR) * 0.44, W * 0.12));
    // sun sits in the larger free gap beside the board so it isn't hidden; centred when the board is narrow
    let sx = W / 2;
    if (gapL > r * 1.4 || gapR > r * 1.4) sx = gapL >= gapR * 0.8 ? gapL * 0.5 : board.x + board.w + gapR * 0.5;
    return { hy, r, sx, sy: hy - r * 0.62 };
  }
  function buildSunset() {
    const L = sunsetLayout(), { hy } = L;
    const sky = mkCanvas(W, H), s = sky.getContext('2d');
    const gr = s.createLinearGradient(0, 0, 0, hy);
    gr.addColorStop(0, '#07031a'); gr.addColorStop(0.4, '#1d0940'); gr.addColorStop(0.72, '#4f1263'); gr.addColorStop(0.92, '#a3237a'); gr.addColorStop(1, '#ff5a8f');
    s.fillStyle = gr; s.fillRect(0, 0, W, hy + 1);
    // soft haze band around the horizon
    const hz = s.createLinearGradient(0, hy - H * 0.18, 0, hy);
    hz.addColorStop(0, 'rgba(255,90,170,0)'); hz.addColorStop(1, 'rgba(255,120,170,0.35)');
    s.fillStyle = hz; s.fillRect(0, hy - H * 0.18, W, H * 0.18);
    // floor
    const fl = s.createLinearGradient(0, hy, 0, H);
    fl.addColorStop(0, '#3a0b4e'); fl.addColorStop(0.25, '#16052c'); fl.addColorStop(1, '#05010e');
    s.fillStyle = fl; s.fillRect(0, hy, W, H - hy);
    // sun glow + reflection on the floor
    const halo = s.createRadialGradient(L.sx, L.sy, L.r * 0.6, L.sx, L.sy, L.r * 2.6);
    halo.addColorStop(0, 'rgba(255,120,90,0.45)'); halo.addColorStop(1, 'rgba(255,60,140,0)');
    s.fillStyle = halo; s.fillRect(L.sx - L.r * 3, L.sy - L.r * 3, L.r * 6, Math.min(L.r * 6, hy - (L.sy - L.r * 3)));
    s.save(); s.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const y = hy + 3 + i * i * (H - hy) * 0.0045 + i * 2;
      if (y > H) break;
      const ww = L.r * (1.5 - i * 0.07);
      s.fillStyle = `rgba(255,${120 - i * 4},${120 + i * 6},${0.32 - i * 0.02})`;
      s.fillRect(L.sx - ww / 2, y, ww, Math.max(1, 2 * S));
    }
    s.restore();
    // stars (static positions; twinkle is drawn live)
    const R = rng(7), stars = [];
    for (let i = 0; i < 70; i++) stars.push([R() * W, R() * hy * 0.7, R() * 1.4 + 0.5, R() * 6.28]);

    // mountains: wireframe ranges on both sides
    const mt = mkCanvas(W, H), m = mt.getContext('2d');
    const range = (x0, x1, seed, peakH) => {
      const R2 = rng(seed), n = Math.max(6, Math.round((x1 - x0) / (W * 0.035)));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, edge = Math.sin(Math.PI * u);
        const hgt = i === 0 || i === n ? 0 : peakH * (0.25 + 0.75 * edge) * (0.45 + R2() * 0.55);
        pts.push([x0 + (x1 - x0) * u + (i && i < n ? (R2() - 0.5) * (x1 - x0) / n * 0.5 : 0), hy - hgt]);
      }
      const fill = m.createLinearGradient(0, hy - peakH, 0, hy);
      fill.addColorStop(0, '#2a0b52'); fill.addColorStop(1, '#0d0322');
      m.beginPath(); m.moveTo(pts[0][0], hy); pts.forEach((p) => m.lineTo(p[0], p[1])); m.lineTo(pts[n][0], hy); m.closePath();
      m.fillStyle = fill; m.fill();
      const stroke = m.createLinearGradient(0, hy - peakH, 0, hy);
      stroke.addColorStop(0, '#5ff4ff'); stroke.addColorStop(0.6, '#b04dff'); stroke.addColorStop(1, '#ff3fd0');
      m.strokeStyle = stroke; m.lineJoin = 'round';
      // inner wireframe: each ridge vertex to two horizon points + a mid contour
      m.globalAlpha = 0.55; m.lineWidth = Math.max(1, 1 * S);
      m.beginPath();
      for (let i = 1; i < n; i++) {
        const [px, py] = pts[i], bx0 = x0 + (x1 - x0) * ((i - 0.5) / n), bx1 = x0 + (x1 - x0) * ((i + 0.5) / n);
        m.moveTo(px, py); m.lineTo(bx0, hy); m.moveTo(px, py); m.lineTo(bx1, hy);
      }
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[i + 1];
        m.moveTo(a[0], (a[1] + hy) / 2); m.lineTo(b[0], (b[1] + hy) / 2);
      }
      m.stroke();
      m.globalAlpha = 1;
      for (const [lw, al] of [[5 * S, 0.18], [1.6 * S, 1]]) {
        m.globalAlpha = al; m.lineWidth = Math.max(1, lw);
        m.beginPath(); pts.forEach((p, i) => (i ? m.lineTo(p[0], p[1]) : m.moveTo(p[0], p[1]))); m.stroke();
      }
      m.globalAlpha = 1;
    };
    const span = W * 0.44;
    range(-W * 0.02, span, 11, H * (L.sx < W / 2 ? 0.12 : 0.22));
    range(W - span, W * 1.02, 23, H * (L.sx > W / 2 ? 0.12 : 0.21));
    range(W * 0.3, W * 0.7, 31, H * 0.1);
    // horizon line glow
    const hl = m.createLinearGradient(0, hy - 6 * S, 0, hy + 6 * S);
    hl.addColorStop(0, 'rgba(255,90,210,0)'); hl.addColorStop(0.5, 'rgba(255,150,230,0.9)'); hl.addColorStop(1, 'rgba(255,90,210,0)');
    m.fillStyle = hl; m.fillRect(0, hy - 6 * S, W, 12 * S);
    return { L, sky, mt, stars };
  }
  function drawSunset(t) {
    const { L, sky, mt, stars } = cache, { hy } = L;
    g.drawImage(sky, 0, 0);
    for (const [x, y, r, ph] of stars) { g.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(t * 0.9 + ph)); g.fillStyle = '#fff2ff'; g.fillRect(x, y, r * S, r * S); }
    g.globalAlpha = 1;
    // sun with scrolling stripe cut-outs (classic outrun look)
    const { sx, sy, r } = L;
    g.save();
    g.beginPath(); g.rect(0, 0, W, hy); g.clip();
    g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2);
    const sg = g.createLinearGradient(0, sy - r, 0, sy + r);
    sg.addColorStop(0, '#fff27a'); sg.addColorStop(0.45, '#ff9a3c'); sg.addColorStop(1, '#ff2f8e');
    g.fillStyle = sg; g.fill();
    const ph = (t * 0.12) % 1;
    for (let i = -1; i < 9; i++) {
      const u = (i + ph) / 8; // 0..1 down the lower half of the sun
      if (u < 0) continue;
      const y = sy - r * 0.25 + u * r * 1.25, th = Math.max(1, r * (0.018 + u * 0.075));
      g.fillStyle = 'rgba(40,8,72,0.92)';
      g.fillRect(sx - r, y, r * 2, th);
    }
    g.restore();
    g.drawImage(mt, 0, 0);
    // perspective grid floor scrolling toward the viewer
    const vx = W / 2, fh = H - hy;
    g.save();
    g.beginPath(); g.rect(0, hy, W, fh); g.clip();
    g.lineWidth = Math.max(1, 1.2 * S);
    const sp = W * 0.07;
    g.strokeStyle = 'rgba(255,70,210,0.55)';
    g.beginPath();
    for (let k = -26; k <= 26; k++) { g.moveTo(vx + k * sp * 0.06, hy); g.lineTo(vx + k * sp * 1.4, H + fh * 0.4); }
    g.stroke();
    const ph2 = (t * 0.55) % 1;
    for (let i = 0; i < 26; i++) {
      const z = 1 + i - ph2;
      if (z <= 0.2) continue;
      const y = hy + fh * (0.9 / z);
      const a = Math.min(1, (y - hy) / (fh * 0.25));
      g.strokeStyle = `rgba(255,80,220,${0.65 * a})`;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    // fade the grid into the horizon haze
    const fz = g.createLinearGradient(0, hy, 0, hy + fh * 0.22);
    fz.addColorStop(0, 'rgba(70,12,90,0.95)'); fz.addColorStop(1, 'rgba(40,8,60,0)');
    g.fillStyle = fz; g.fillRect(0, hy, W, fh * 0.22);
    g.restore();
  }

  // ———————————————————— SPACE ————————————————————
  function buildSpace() {
    const base = mkCanvas(W, H), s = base.getContext('2d');
    const gr = s.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#02020a'); gr.addColorStop(0.6, '#070722'); gr.addColorStop(1, '#0d0626');
    s.fillStyle = gr; s.fillRect(0, 0, W, H);
    // nebula blobs (drawn on a bigger layer that drifts slowly)
    const neb = mkCanvas(Math.round(W * 1.2), Math.round(H * 1.2)), n = neb.getContext('2d');
    const R = rng(5);
    const cols = [[120, 50, 230], [20, 180, 210], [230, 60, 160], [80, 40, 200]];
    for (let i = 0; i < 9; i++) {
      const x = R() * neb.width, y = R() * neb.height, rr = (0.15 + R() * 0.3) * Math.max(W, H);
      const c = cols[i % cols.length], rg = n.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.30)`); rg.addColorStop(0.5, `rgba(${c[0]},${c[1]},${c[2]},0.10)`); rg.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      n.fillStyle = rg; n.fillRect(0, 0, neb.width, neb.height);
    }
    const layers = [[110, 0.6, 3], [60, 1.1, 8], [26, 1.8, 18]].map(([cnt, sz, spd], li) => {
      const R2 = rng(40 + li), arr = [];
      for (let i = 0; i < cnt; i++) arr.push([R2() * W, R2() * H, sz * (0.6 + R2() * 0.8), R2() * 6.28, R2() < 0.15 ? (R2() < 0.5 ? '#9be7ff' : '#ffc6ff') : '#ffffff']);
      return { arr, spd };
    });
    // ringed planet in the bigger free gap
    const { gapL, gapR } = board;
    const pr = Math.max(18, Math.min(H * 0.11, Math.max(gapL, gapR) * 0.32));
    const px = gapL >= gapR * 0.8 ? gapL * 0.5 : board.x + board.w + gapR * 0.5, py = H * 0.28;
    const pl = mkCanvas(Math.ceil(pr * 5), Math.ceil(pr * 3)), p = pl.getContext('2d');
    const cx = pl.width / 2, cy = pl.height / 2;
    const ring = (front) => {
      p.save(); p.translate(cx, cy); p.rotate(-0.35); p.scale(1, 0.28);
      p.beginPath(); p.arc(0, 0, pr * 2, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      p.lineWidth = pr * 0.5; p.strokeStyle = 'rgba(255,170,230,0.35)'; p.stroke();
      p.lineWidth = pr * 0.12; p.strokeStyle = 'rgba(255,220,255,0.6)'; p.stroke();
      p.restore();
    };
    ring(false);
    const pg = p.createRadialGradient(cx - pr * 0.4, cy - pr * 0.4, pr * 0.1, cx, cy, pr);
    pg.addColorStop(0, '#ffb3e6'); pg.addColorStop(0.5, '#a03cc8'); pg.addColorStop(1, '#2a0a50');
    p.beginPath(); p.arc(cx, cy, pr, 0, Math.PI * 2); p.fillStyle = pg; p.fill();
    ring(true);
    return { base, neb, layers, pl, px, py };
  }
  function drawSpace(t) {
    const { base, neb, layers, pl, px, py } = cache;
    g.drawImage(base, 0, 0);
    g.drawImage(neb, -W * 0.1 + Math.sin(t * 0.05) * W * 0.06, -H * 0.1 + Math.cos(t * 0.04) * H * 0.05);
    for (const { arr, spd } of layers) {
      for (const [x, y, r, ph, c] of arr) {
        const xx = (x + t * spd * S) % W;
        g.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.7 + ph));
        g.fillStyle = c; g.fillRect(xx, y, r * S, r * S);
      }
    }
    g.globalAlpha = 1;
    g.drawImage(pl, px - pl.width / 2, py - pl.height / 2 + Math.sin(t * 0.3) * 3 * S);
    // a shooting star every ~7 s
    const k = (t % 7) / 7;
    if (k < 0.12) {
      const R = rng(Math.floor(t / 7) + 3), x0 = R() * W * 0.8, y0 = R() * H * 0.4, u = k / 0.12;
      const x = x0 + u * W * 0.25, y = y0 + u * H * 0.12;
      const lg = g.createLinearGradient(x - W * 0.06, y - H * 0.03, x, y);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, `rgba(255,255,255,${0.9 * (1 - u)})`);
      g.strokeStyle = lg; g.lineWidth = Math.max(1, 1.5 * S);
      g.beginPath(); g.moveTo(x - W * 0.06, y - H * 0.03); g.lineTo(x, y); g.stroke();
    }
  }

  // ———————————————————— CITY ————————————————————
  function buildCity() {
    const hy = Math.round(H * 0.64);
    const sky = mkCanvas(W, H), s = sky.getContext('2d');
    const gr = s.createLinearGradient(0, 0, 0, hy);
    gr.addColorStop(0, '#050318'); gr.addColorStop(0.5, '#1a0a3e'); gr.addColorStop(0.85, '#5a1466'); gr.addColorStop(1, '#ff4f9a');
    s.fillStyle = gr; s.fillRect(0, 0, W, hy + 1);
    const fl = s.createLinearGradient(0, hy, 0, H);
    fl.addColorStop(0, '#2a0a40'); fl.addColorStop(0.3, '#0c0420'); fl.addColorStop(1, '#03010a');
    s.fillStyle = fl; s.fillRect(0, hy, W, H - hy);
    // big moon
    const { gapL, gapR } = board;
    const mr = Math.max(20, Math.min(H * 0.1, Math.max(gapL, gapR) * 0.32));
    const mx = gapL >= gapR * 0.8 ? gapL * 0.5 : board.x + board.w + gapR * 0.5, my = H * 0.2;
    const halo = s.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.8);
    halo.addColorStop(0, 'rgba(255,140,220,0.35)'); halo.addColorStop(1, 'rgba(255,140,220,0)');
    s.fillStyle = halo; s.fillRect(0, 0, W, hy);
    const mg = s.createLinearGradient(0, my - mr, 0, my + mr);
    mg.addColorStop(0, '#ffe6fb'); mg.addColorStop(1, '#ff8ad8');
    s.beginPath(); s.arc(mx, my, mr, 0, Math.PI * 2); s.fillStyle = mg; s.fill();
    // skyline strips (tile horizontally, scroll at two speeds)
    const strip = (seed, hMax, body, edge, windows) => {
      const sw = Math.round(W * 1.5), c = mkCanvas(sw, Math.round(hMax + 4)), x = c.getContext('2d'), R = rng(seed);
      const top = c.height;
      let bx = 0;
      const blds = [];
      while (bx < sw) {
        const bw = Math.round(W * (0.025 + R() * 0.05)), bh = Math.round(hMax * (0.3 + R() * 0.7));
        blds.push([bx, bw, bh]); bx += bw + Math.round(R() * W * 0.006);
      }
      for (const [x0, bw, bh] of blds) {
        x.fillStyle = body; x.fillRect(x0, top - bh, bw, bh);
        x.fillStyle = edge; x.fillRect(x0, top - bh, bw, Math.max(1, S * 1.2));
        if (R() < 0.3) { x.fillRect(x0 + bw / 2 - S, top - bh - hMax * 0.08, Math.max(1, S * 1.5), hMax * 0.08); }
        if (windows) {
          const ws = Math.max(2, Math.round(3 * S)), cols = ['#ffe066', '#9be7ff', '#ff8ad8'];
          for (let yy = top - bh + ws * 2; yy < top - ws; yy += ws * 2.2) for (let xx = x0 + ws; xx < x0 + bw - ws; xx += ws * 2) {
            if (R() < 0.33) { x.fillStyle = cols[(R() * 3) | 0]; x.globalAlpha = 0.5 + R() * 0.5; x.fillRect(xx, yy, ws, ws); }
          }
          x.globalAlpha = 1;
          if (R() < 0.25) { x.fillStyle = R() < 0.5 ? '#ff3fd0' : '#3ef2ff'; x.fillRect(x0 + 2 * S, top - bh * 0.85, Math.max(2, 2.5 * S), bh * 0.4); }
        }
      }
      return c;
    };
    const far = strip(91, H * 0.26, '#2a0f55', 'rgba(255,120,220,0.7)', false);
    const near = strip(17, H * 0.19, '#0b0418', 'rgba(62,242,255,0.8)', true);
    return { hy, sky, far, near };
  }
  function drawCity(t) {
    const { hy, sky, far, near } = cache;
    g.drawImage(sky, 0, 0);
    const tile = (c, speed, alpha, flip) => {
      const off = -((t * speed * S) % c.width);
      g.globalAlpha = alpha;
      for (let x = off; x < W; x += c.width) {
        if (!flip) g.drawImage(c, x, hy - c.height);
        else { g.save(); g.translate(0, hy * 2); g.scale(1, -1); g.drawImage(c, x, hy - c.height); g.restore(); }
      }
      g.globalAlpha = 1;
    };
    tile(far, 5, 1);
    tile(near, 12, 1);
    // water reflection + shimmer
    tile(far, 5, 0.18, true);
    tile(near, 12, 0.28, true);
    const fh = H - hy;
    g.strokeStyle = 'rgba(62,242,255,0.28)'; g.lineWidth = Math.max(1, S);
    g.beginPath();
    const ph = (t * 0.4) % 1;
    for (let i = 0; i < 18; i++) { const z = 1 + i - ph; if (z <= 0.2) continue; const y = hy + fh * (0.9 / z); g.moveTo(0, y); g.lineTo(W, y); }
    for (let k = -20; k <= 20; k++) { g.moveTo(W / 2 + k * W * 0.004, hy); g.lineTo(W / 2 + k * W * 0.1, H + fh * 0.4); }
    g.stroke();
    const hl = g.createLinearGradient(0, hy - 4 * S, 0, hy + 4 * S);
    hl.addColorStop(0, 'rgba(255,90,210,0)'); hl.addColorStop(0.5, 'rgba(255,150,230,0.8)'); hl.addColorStop(1, 'rgba(255,90,210,0)');
    g.fillStyle = hl; g.fillRect(0, hy - 4 * S, W, 8 * S);
  }

  const BUILD = { sunset: buildSunset, space: buildSpace, city: buildCity };
  const DRAW = { sunset: drawSunset, space: drawSpace, city: drawCity };

  function paint(now) {
    if (!alive || name === 'off') return;
    measure();
    const t = (now - t0) / 1000;
    DRAW[name](t);
    // keep the board readable: dim the whole backdrop a bit and darken right behind the board
    g.fillStyle = 'rgba(4,2,10,0.18)'; g.fillRect(0, 0, W, H);
    const cx = board.x + board.w / 2, cy = board.y + board.h / 2, rr = Math.max(board.w, board.h) * 0.62;
    const vg = g.createRadialGradient(cx, cy, rr * 0.35, cx, cy, rr);
    vg.addColorStop(0, 'rgba(3,2,8,0.55)'); vg.addColorStop(1, 'rgba(3,2,8,0)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 32) return; // ~30 fps is plenty for slow background motion
    last = now;
    paint(now);
  }
  function restart() {
    cancelAnimationFrame(raf); raf = 0;
    if (!alive || name === 'off') return;
    if (animated()) raf = requestAnimationFrame(loop);
    else requestAnimationFrame((n) => paint(n));
  }
  const onResize = () => { if (!animated()) requestAnimationFrame((n) => paint(n)); };
  const ro = window.ResizeObserver ? new ResizeObserver(onResize) : null;
  ro?.observe(frame);
  const offTier = onTier(() => { cacheKey = ''; restart(); });

  return {
    set(n) {
      name = BG_LIST.includes(n) ? n : 'sunset';
      cv.hidden = name === 'off';
      frame.classList.toggle('has-bg', name !== 'off');
      cacheKey = '';
      restart();
    },
    get: () => name,
    destroy() { alive = false; cancelAnimationFrame(raf); ro?.disconnect(); offTier(); frame.classList.remove('has-bg'); cv.remove(); },
  };
}
