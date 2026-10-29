// Records the 2D drawing calls a game makes each frame so the 3D view can rebuild them as meshes.
// The game keeps its normal Canvas 2D code (same mechanics); this sits between the game and the canvas.
// Text, images and full-screen dim overlays still go to the real 2D canvas, which lies on top of the 3D view.
const TAU = Math.PI * 2;

const colorCache = new Map();
let probe = null;
/** CSS colour -> [r, g, b, a] (0..1). Gradients/patterns fall back to grey. */
export function parseColor(c) {
  if (typeof c !== 'string') return [0.55, 0.55, 0.6, 1];
  let v = colorCache.get(c);
  if (v) return v;
  let m;
  if ((m = /^#([0-9a-f]{3,8})$/i.exec(c))) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    v = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  } else if ((m = /^rgba?\(([^)]+)\)$/i.exec(c))) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    v = [p[0] / 255, p[1] / 255, p[2] / 255, p[3] == null ? 1 : p[3]];
  } else {
    // named colours / hsl(): let the browser resolve it once
    if (!probe) probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = '#000'; probe.fillStyle = c;
    const r = probe.fillStyle;
    v = r === c ? [0.55, 0.55, 0.6, 1] : parseColor(r);
  }
  if (colorCache.size > 2000) colorCache.clear();
  colorCache.set(c, v);
  return v;
}

/**
 * Wrap a canvas so getContext('2d') returns a recording proxy.
 * cap.mode3d = false -> everything is passed through (plain 2D fallback).
 */
export function captureCanvas(canvas) {
  const real = canvas.getContext('2d');
  const cap = { ops: [], bg: null, mode3d: true, W: 0, H: 0 };
  let subs = [];
  let cur = null;

  const xf = () => real.getTransform();
  const tp = (m, x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  const alphaOf = (style) => parseColor(style)[3] * real.globalAlpha;
  const W = () => canvas.width, H = () => canvas.height;

  function startSub(x, y) { cur = { pts: [tp(xf(), x, y)], closed: false }; subs.push(cur); }
  function arcPts(x, y, r, a0, a1, ccw, rx = r, ry = r, rot = 0) {
    const m = xf();
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep = (sweep % TAU) + TAU;
    if (ccw && sweep > 0) sweep = (sweep % TAU) - TAU;
    if (Math.abs(a1 - a0) >= TAU - 1e-3) sweep = ccw ? -TAU : TAU;
    const full = Math.abs(sweep) >= TAU - 1e-3;
    const scale = Math.hypot(m.a, m.b);
    if (full && rx === ry && (!cur || cur.pts.length === 0) && Math.abs(Math.hypot(m.c, m.d) - scale) < 1e-3) {
      const [cx, cy] = tp(m, x, y);
      subs.push({ circle: [cx, cy, r * scale] });
      cur = null;
      return;
    }
    const n = Math.max(6, Math.min(40, Math.ceil(Math.abs(sweep) / TAU * 28)));
    if (!cur) { cur = { pts: [], closed: false }; subs.push(cur); }
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
      const a = a0 + sweep * i / n;
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      cur.pts.push(tp(m, x + ex * cr - ey * sr, y + ex * sr + ey * cr));
    }
  }

  function emitRect(x, y, w, h, style, kind) {
    const a = alphaOf(style);
    if (a < 0.12) return;
    const m = xf();
    const color = parseColor(style);
    if (m.b === 0 && m.c === 0) {
      let x0 = m.a * x + m.e, y0 = m.d * y + m.f, x1 = m.a * (x + w) + m.e, y1 = m.d * (y + h) + m.f;
      if (x1 < x0) [x0, x1] = [x1, x0];
      if (y1 < y0) [y0, y1] = [y1, y0];
      cap.ops.push({ t: kind, x: x0, y: y0, w: x1 - x0, h: y1 - y0, c: color, a });
    } else {
      cap.ops.push({ t: kind === 'rect' ? 'poly' : 'line', pts: [tp(m, x, y), tp(m, x + w, y), tp(m, x + w, y + h), tp(m, x, y + h)], closed: true, c: color, a, lw: real.lineWidth * Math.hypot(m.a, m.b) });
    }
  }

  const handlers = {
    fillRect(x, y, w, h) {
      if (!cap.mode3d) return real.fillRect(x, y, w, h);
      const m = xf();
      const area = Math.abs(w * h * (m.a * m.d - m.b * m.c));
      if (area >= W() * H() * 0.9) {
        const a = alphaOf(real.fillStyle);
        if (a < 0.97) return real.fillRect(x, y, w, h); // dim overlay (pause / game over) stays 2D
        cap.bg = parseColor(real.fillStyle);
        cap.ops.length = 0; // a full opaque fill paints over everything before it
        return;
      }
      emitRect(x, y, w, h, real.fillStyle, 'rect');
    },
    strokeRect(x, y, w, h) {
      if (!cap.mode3d) return real.strokeRect(x, y, w, h);
      const m = xf();
      const pts = [tp(m, x, y), tp(m, x + w, y), tp(m, x + w, y + h), tp(m, x, y + h)];
      const a = alphaOf(real.strokeStyle);
      if (a >= 0.12) cap.ops.push({ t: 'line', pts, closed: true, c: parseColor(real.strokeStyle), a, lw: real.lineWidth * Math.hypot(m.a, m.b) });
    },
    clearRect(x, y, w, h) { real.clearRect(x, y, w, h); },
    beginPath() { subs = []; cur = null; real.beginPath(); },
    moveTo(x, y) { startSub(x, y); real.moveTo(x, y); },
    lineTo(x, y) { if (!cur) startSub(x, y); else cur.pts.push(tp(xf(), x, y)); real.lineTo(x, y); },
    closePath() { if (cur) { cur.closed = true; const p = cur.pts[0]; cur = { pts: [p], closed: false }; subs.push(cur); } real.closePath(); },
    rect(x, y, w, h) {
      const m = xf();
      subs.push({ pts: [tp(m, x, y), tp(m, x + w, y), tp(m, x + w, y + h), tp(m, x, y + h)], closed: true, isRect: [x, y, w, h, m] });
      cur = null;
      real.rect(x, y, w, h);
    },
    roundRect(x, y, w, h, r) { handlers.rect(x, y, w, h); },
    arc(x, y, r, a0, a1, ccw) { arcPts(x, y, r, a0, a1, !!ccw); real.arc(x, y, r, a0, a1, ccw); },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) { arcPts(x, y, Math.max(rx, ry), a0, a1, !!ccw, rx, ry, rot); real.ellipse(x, y, rx, ry, rot, a0, a1, ccw); },
    quadraticCurveTo(cx, cy, x, y) { handlers.lineTo(x, y); },
    bezierCurveTo(a, b, c, d, x, y) { handlers.lineTo(x, y); },
    arcTo(x1, y1, x2, y2) { handlers.lineTo(x1, y1); },
    fill() {
      if (!cap.mode3d) return real.fill();
      const a = alphaOf(real.fillStyle);
      if (a < 0.12) return;
      const c = parseColor(real.fillStyle);
      for (const s of subs) {
        if (s.circle) cap.ops.push({ t: 'circle', x: s.circle[0], y: s.circle[1], r: s.circle[2], c, a });
        else if (s.isRect && s.isRect[4].b === 0 && s.isRect[4].c === 0) {
          const [x, y, w, h, m] = s.isRect;
          let x0 = m.a * x + m.e, y0 = m.d * y + m.f, x1 = m.a * (x + w) + m.e, y1 = m.d * (y + h) + m.f;
          if (x1 < x0) [x0, x1] = [x1, x0];
          if (y1 < y0) [y0, y1] = [y1, y0];
          cap.ops.push({ t: 'rect', x: x0, y: y0, w: x1 - x0, h: y1 - y0, c, a });
        } else if (s.pts.length >= 3) cap.ops.push({ t: 'poly', pts: s.pts, c, a });
      }
    },
    stroke() {
      if (!cap.mode3d) return real.stroke();
      const a = alphaOf(real.strokeStyle);
      if (a < 0.12) return;
      const c = parseColor(real.strokeStyle);
      const lw = real.lineWidth * Math.hypot(xf().a, xf().b);
      for (const s of subs) {
        if (s.circle) {
          const [x, y, r] = s.circle, n = 24, pts = [];
          for (let i = 0; i < n; i++) pts.push([x + Math.cos(i / n * TAU) * r, y + Math.sin(i / n * TAU) * r]);
          cap.ops.push({ t: 'line', pts, closed: true, c, a, lw });
        } else if (s.pts.length >= 2) cap.ops.push({ t: 'line', pts: s.pts, closed: s.closed, c, a, lw });
      }
    },
  };

  const proxy = new Proxy(real, {
    get(t, k) {
      if (k in handlers) return handlers[k];
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, k, v) { t[k] = v; return true; },
  });

  const getCtx = canvas.getContext.bind(canvas);
  canvas.getContext = (type, ...rest) => (type === '2d' ? proxy : getCtx(type, ...rest));

  /** Start a frame: clear the 2D overlay and the op list. */
  cap.begin = () => {
    cap.W = canvas.width; cap.H = canvas.height;
    if (!cap.mode3d) return;
    cap.ops.length = 0;
    real.save(); real.setTransform(1, 0, 0, 1, 0, 0); real.clearRect(0, 0, canvas.width, canvas.height); real.restore();
  };
  return cap;
}
