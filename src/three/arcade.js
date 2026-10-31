// ARCADE camera mode: a 3D arcade cabinet seen from the front, with the live cart on its CRT.
// The normal board view (classic camera) is rendered into a texture each frame and shown on the
// cabinet screen together with the cart's 2D text layer (score, GAME OVER, ...), plus scanlines and
// a slight barrel curve. Marquee and control-panel art are drawn once on CanvasTextures.
import { cartIcon } from '../carticons.js';

const CRT_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CRT_FS = `
uniform sampler2D tBoard; uniform sampler2D tHud; uniform float uHud; uniform float uTime; uniform float uLines; uniform vec2 uAsp;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec2 q = p * uAsp;
  float r2 = dot(q, q);
  p *= (1.0 + 0.045 * r2) / (1.0 + 0.045 * dot(uAsp, uAsp));
  vec2 st = p * 0.5 + 0.5;
  vec3 c = texture2D(tBoard, st).rgb;
  if (uHud > 0.5) { vec4 h = texture2D(tHud, st); c = mix(c, h.rgb * 1.1, h.a); }
  c *= 0.8 + 0.2 * sin(st.y * uLines * 6.2832);
  c *= 1.0 - 0.035 * sin(uTime * 7.0 + st.y * 3.0) * 0.5;
  float v = smoothstep(1.55, 0.55, length(q));
  c *= 0.45 + 0.6 * v;
  c += vec3(0.0015, 0.002, 0.003);
  // glass sheen in the top-left corner
  c += vec3(0.010, 0.012, 0.016) * smoothstep(0.5, 0.0, length(st - vec2(0.2, 0.86)));
  float e = smoothstep(1.0, 0.985, max(abs(p.x), abs(p.y)));
  gl_FragColor = vec4(c * e * 1.12, 1.0);
  #include <colorspace_fragment>
}`;

function svgImage(svg, cb) {
  if (!svg) return null;
  const img = new Image();
  img.onload = () => cb(img);
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
  return img;
}

export function createArcade({ THREE, renderer, gameId, title, accent, hudCanvas }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  let rt = null, rtW = 0, rtH = 0;
  let a = 1; // screen aspect (w / h); the screen is 1 unit tall
  let built = null;
  const icon = { img: null }; // set once the cart icon SVG has loaded
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hudTex = keep(new THREE.CanvasTexture(hudCanvas || document.createElement('canvas')));
  hudTex.colorSpace = THREE.SRGBColorSpace;
  hudTex.minFilter = THREE.LinearFilter; hudTex.generateMipmaps = false;
  const crtMat = keep(new THREE.ShaderMaterial({
    vertexShader: CRT_VS, fragmentShader: CRT_FS,
    uniforms: { tBoard: { value: null }, tHud: { value: hudTex }, uHud: { value: hudCanvas ? 1 : 0 }, uTime: { value: 0 }, uLines: { value: 180 }, uAsp: { value: new THREE.Vector2(1, 1) } },
  }));

  // lights: dim room + pink / cyan neon from the sides + the screen's own glow
  scene.add(new THREE.HemisphereLight(0x8a7cff, 0x120818, 0.9));
  const pink = new THREE.PointLight(0xff3fa4, 6, 8, 1.6); pink.position.set(-2.2, 1.2, 1.6); scene.add(pink);
  const cyan = new THREE.PointLight(0x40e0ff, 4, 8, 1.6); cyan.position.set(2.4, 0.6, 1.8); scene.add(cyan);
  const glow = new THREE.PointLight(new THREE.Color(accent), 1.6, 3, 1.5); glow.position.set(0, -0.2, 0.9); scene.add(glow);
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(0.5, 3, 4); scene.add(key);

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const redraw = () => { draw(c.getContext('2d'), w, h); t.needsUpdate = true; };
    redraw();
    return { tex: t, redraw };
  }

  function drawMarquee(g, w, h) {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#07051a'); bg.addColorStop(0.62, '#1d0b3a'); bg.addColorStop(1, '#3a0d4a');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // stars
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) { g.globalAlpha = 0.3 + rnd() * 0.7; g.fillRect(rnd() * w, rnd() * h * 0.6, 2, 2); }
    g.globalAlpha = 1;
    // sun on the right
    const sx = w * 0.86, sy = h * 0.62, sr = h * 0.36;
    g.save(); g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.clip();
    const sg = g.createLinearGradient(0, sy - sr, 0, sy + sr); sg.addColorStop(0, '#ffe066'); sg.addColorStop(0.55, '#ff7b54'); sg.addColorStop(1, '#ff3fa4');
    g.fillStyle = sg; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    g.fillStyle = '#1d0b3a';
    for (let i = 0; i < 6; i++) { const y = sy + i * sr * 0.17; g.fillRect(sx - sr, y, sr * 2, 2 + i * 1.6); }
    g.restore();
    // horizon grid
    const hy = h * 0.78;
    g.fillStyle = '#12052a'; g.fillRect(0, hy, w, h - hy);
    g.strokeStyle = 'rgba(255,63,164,0.8)'; g.lineWidth = 2;
    for (let i = 0; i < 5; i++) { const y = hy + (h - hy) * (i / 4) ** 1.6; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let i = -12; i <= 12; i++) { g.beginPath(); g.moveTo(w / 2 + i * w * 0.02, hy); g.lineTo(w / 2 + i * w * 0.09, h); g.stroke(); }
    // neon mountains (both sides)
    const mount = (x0, x1, peaks) => {
      g.beginPath(); g.moveTo(x0, hy);
      peaks.forEach(([px, py]) => g.lineTo(x0 + (x1 - x0) * px, hy - h * py));
      g.lineTo(x1, hy); g.closePath();
      g.fillStyle = '#16083a'; g.fill();
      g.strokeStyle = '#40e0ff'; g.lineWidth = 2.5; g.stroke();
    };
    mount(0, w * 0.3, [[0.18, 0.3], [0.32, 0.18], [0.5, 0.42], [0.72, 0.2], [0.86, 0.3]]);
    mount(w * 0.7, w, [[0.15, 0.22], [0.32, 0.36], [0.5, 0.16], [0.7, 0.3], [0.88, 0.12]]);
    // title in the cart's colour, glowing
    let fs = Math.round(h * 0.34);
    g.font = `${fs}px "Press Start 2P", monospace`;
    const iconW = icon.img ? fs * 2.1 : 0;
    while (fs > 10 && g.measureText(title).width + iconW > w * 0.62) { fs -= 2; g.font = `${fs}px "Press Start 2P", monospace`; }
    const tw = g.measureText(title).width, total = tw + iconW;
    const tx = w / 2 - total / 2 + iconW;
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.shadowColor = accent; g.shadowBlur = fs * 0.6;
    g.fillStyle = '#000'; g.fillText(title, tx + fs * 0.08, h * 0.47 + fs * 0.08);
    g.fillStyle = accent; g.fillText(title, tx, h * 0.47);
    g.shadowBlur = 0;
    if (icon.img) {
      g.imageSmoothingEnabled = false;
      const ih = fs * 1.3, iw = ih * (icon.img.width / icon.img.height || 2.5);
      g.drawImage(icon.img, tx - iw - fs * 0.5, h * 0.47 - ih / 2, iw, ih);
    }
    // frame line
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  }

  function drawPanel(g, w, h) {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#1a0f2e'); bg.addColorStop(1, '#0d0818');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff3fa4'; g.lineWidth = 6; g.shadowColor = '#ff3fa4'; g.shadowBlur = 12;
    g.strokeRect(18, 16, w - 36, h - 32);
    g.strokeStyle = '#ffb347'; g.lineWidth = 2; g.shadowBlur = 0; g.strokeRect(30, 28, w - 60, h - 56);
    g.font = `${Math.round(Math.min(h * 0.07, w * 0.018))}px "Press Start 2P", monospace`; g.fillStyle = '#e8e0ff'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText('PAUSE', w * 0.75, h * 0.38); g.fillText('RESTART', w * 0.75, h * 0.66);
    if (icon.img) {
      g.imageSmoothingEnabled = false;
      const ih = h * 0.14, iw = ih * (icon.img.width / icon.img.height || 2.5);
      g.drawImage(icon.img, w * 0.07, h * 0.62, iw, ih);
    }
  }

  function build() {
    if (built) { scene.remove(built.group); built.mats.forEach((m) => m.dispose()); built.geos.forEach((x) => x.dispose()); }
    const group = new THREE.Group(), mats = [], geos = [];
    const M = (m) => (mats.push(m), m), G = (x) => (geos.push(x), x);
    const mesh = (geo, mat, x, y, z) => { const o = new THREE.Mesh(G(geo), mat); o.position.set(x, y, z); group.add(o); return o; };
    const sw = a, bz = 0.13, BW = sw + bz * 2, CW = BW + 0.16, half = CW / 2;
    const body = M(new THREE.MeshStandardMaterial({ color: 0x1b1230, roughness: 0.55, metalness: 0.2 }));
    const dark = M(new THREE.MeshStandardMaterial({ color: 0x0b0a12, roughness: 0.4, metalness: 0.4 }));
    const chrome = M(new THREE.MeshStandardMaterial({ color: 0x2a2836, roughness: 0.35, metalness: 0.6 }));
    const neonPink = M(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.4, 1.5) }));
    const neonPurple = M(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.45, 2.6) }));
    // back body + front face around the screen
    mesh(new THREE.BoxGeometry(BW + 0.06, 1 + bz * 2 + 0.06, 0.08), chrome, 0, 0, -0.02);
    mesh(new THREE.BoxGeometry(BW, 1 + bz * 2, 0.1), dark, 0, 0, 0);
    const scr = mesh(new THREE.PlaneGeometry(sw, 1), crtMat, 0, 0, 0.055);
    scr.renderOrder = 1;
    // speaker strip between screen and marquee
    mesh(new THREE.BoxGeometry(CW, 0.14, 0.12), dark, 0, 0.71, 0.0);
    // marquee: lit sign on top
    const mh = Math.min(0.38, Math.max(0.26, CW * 0.2));
    const mq = canvasTex(1024, Math.round(1024 * mh / CW), drawMarquee);
    built = { mq };
    mesh(new THREE.BoxGeometry(CW + 0.02, mh + 0.06, 0.16), chrome, 0, 0.78 + mh / 2, 0.02);
    mesh(new THREE.PlaneGeometry(CW - 0.04, mh), M(new THREE.MeshBasicMaterial({ map: mq.tex, color: new THREE.Color(1.15, 1.15, 1.15) })), 0, 0.78 + mh / 2, 0.105);
    const top = 0.81 + mh + 0.03;
    mesh(new THREE.BoxGeometry(CW, 3.0 + top, 1.2), body, 0, (top - 3.0) / 2, -0.66);
    // control panel (tilted toward the player) + front apron
    const PD = 0.52, PT = -0.62 - bz * 0.4;
    const pt = canvasTex(1024, Math.round(1024 * PD / CW), drawPanel);
    built.pt = pt;
    const panel = new THREE.Group();
    panel.position.set(0, PT, 0.05); panel.rotation.x = 0.42;
    group.add(panel);
    const pmesh = (geo, mat, x, y, z) => { const o = new THREE.Mesh(G(geo), mat); o.position.set(x, y, z); panel.add(o); return o; };
    pmesh(new THREE.BoxGeometry(CW, 0.08, PD), dark, 0, -0.04, PD / 2);
    const surf = pmesh(new THREE.PlaneGeometry(CW - 0.02, PD - 0.02), M(new THREE.MeshStandardMaterial({ map: pt.tex, roughness: 0.5, metalness: 0.1, emissive: 0xffffff, emissiveMap: pt.tex, emissiveIntensity: 0.35 })), 0, 0.002, PD / 2);
    surf.rotation.x = -Math.PI / 2;
    pmesh(new THREE.BoxGeometry(CW, 0.05, 0.04), chrome, 0, -0.03, PD);
    // joystick
    const s0 = Math.min(1, CW / 1.5);
    const jx = -CW * 0.3;
    pmesh(new THREE.CylinderGeometry(0.07 * s0, 0.08 * s0, 0.02, 24), dark, jx, 0.01, PD * 0.45);
    const stick = pmesh(new THREE.CylinderGeometry(0.012 * s0, 0.012 * s0, 0.16 * s0, 10), chrome, jx, 0.08 * s0, PD * 0.45);
    stick.rotation.x = -0.15;
    const ball = pmesh(new THREE.SphereGeometry(0.055 * s0, 24, 16), M(new THREE.MeshStandardMaterial({ color: 0xff1f3a, roughness: 0.25, metalness: 0.1, emissive: 0x550010 })), jx, 0.17 * s0, PD * 0.43);
    ball.castShadow = false;
    // 3 pairs of buttons: red, yellow, blue
    const cols = [0xff2840, 0xffc400, 0x2f6bff];
    const btnGeo = G(new THREE.CylinderGeometry(0.042 * s0, 0.045 * s0, 0.03, 24));
    const ringGeo = G(new THREE.CylinderGeometry(0.052 * s0, 0.052 * s0, 0.012, 24));
    cols.forEach((c, i) => {
      const bm = M(new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, emissive: c, emissiveIntensity: 0.35 }));
      for (let r = 0; r < 2; r++) {
        const x = -CW * 0.06 + i * CW * 0.13, z = PD * (0.32 + r * 0.3);
        const rg = new THREE.Mesh(ringGeo, dark); rg.position.set(x, 0.006, z); panel.add(rg);
        const b = new THREE.Mesh(btnGeo, bm); b.position.set(x, 0.02, z); panel.add(b);
      }
    });
    // small black PAUSE / RESTART pills next to their labels
    const pill = G(new THREE.BoxGeometry(0.06 * s0, 0.016, 0.03 * s0));
    pmesh(pill, chrome, CW * 0.2, 0.008, PD * 0.38);
    pmesh(pill, chrome, CW * 0.2, 0.008, PD * 0.66);
    // apron under the panel
    const apronY = PT - Math.sin(0.42) * PD;
    mesh(new THREE.BoxGeometry(CW, 1.6, 0.1), body, 0, apronY - 0.8, Math.cos(0.42) * PD + 0.0);
    // side panels with neon front edges (profile in the y/z plane)
    const prof = [[-1.25, top + 0.06], [0.2, top + 0.06], [0.2, 0.72], [0.1, 0.62], [0.1, PT], [Math.cos(0.42) * PD + 0.08, apronY + 0.02], [Math.cos(0.42) * PD + 0.08, -3.0], [-1.25, -3.0]];
    const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)));
    const sideGeo = G(new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false }));
    sideGeo.rotateY(-Math.PI / 2);
    const sideMat = M(new THREE.MeshStandardMaterial({ color: 0x241638, roughness: 0.45, metalness: 0.3 }));
    for (const sgn of [-1, 1]) {
      const sp = new THREE.Mesh(sideGeo, sideMat);
      sp.position.set(sgn * half + (sgn > 0 ? 0.07 : 0), 0, 0);
      group.add(sp);
      const pts = prof.slice(1, 7).map(([z, y]) => new THREE.Vector3(0, y, z));
      const path = new THREE.CurvePath();
      for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
      const tube = new THREE.Mesh(G(new THREE.TubeGeometry(path, 120, 0.012, 6, false)), neonPink);
      tube.position.set(sgn * (half + 0.035) + sgn * 0.036, 0, 0.003);
      group.add(tube);
      const tube2 = new THREE.Mesh(tube.geometry, neonPurple);
      tube2.position.set(sgn * (half + 0.035) - sgn * 0.036, 0, -0.01);
      group.add(tube2);
    }
    scene.add(group);
    built.group = group; built.mats = mats; built.geos = geos;
    built.box = { x: half + 0.12, top: top + 0.08, bottom: apronY - 0.06, zFront: Math.cos(0.42) * PD + 0.1 };
  }

  // camera framing: player standing at the cabinet, eyes a bit above the screen centre
  const fitV = new THREE.Vector3(), tmpCam = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  const endPos = new THREE.Vector3(), endLook = new THREE.Vector3(), startPos = new THREE.Vector3(), startLook = new THREE.Vector3(0, 0, 0);
  let fitKey = '';
  function solveFit(aspect) {
    const key = aspect.toFixed(4) + '|' + a.toFixed(4);
    if (key === fitKey) return;
    fitKey = key;
    tmpCam.aspect = aspect; tmpCam.fov = 30; tmpCam.updateProjectionMatrix();
    const b = built.box;
    const pts = [];
    for (const x of [-b.x, b.x]) { pts.push(new THREE.Vector3(x, b.top, 0.15), new THREE.Vector3(x, b.bottom, b.zFront)); }
    const look = new THREE.Vector3(0, (b.top + b.bottom) / 2 + 0.02, 0);
    const dir = new THREE.Vector3(0, 0.28, 1).normalize();
    let lo = 0.5, hi = 40;
    for (let i = 0; i < 40; i++) {
      const d = (lo + hi) / 2;
      tmpCam.position.copy(look).addScaledVector(dir, d); tmpCam.lookAt(look); tmpCam.updateMatrixWorld(true);
      let ok = true;
      for (const p of pts) { fitV.copy(p).project(tmpCam); if (fitV.z > 1 || Math.abs(fitV.x) > 0.96 || Math.abs(fitV.y) > 0.97) { ok = false; break; } }
      if (ok) hi = d; else lo = d;
    }
    endPos.copy(look).addScaledVector(dir, hi); endLook.copy(look);
    // intro start: square on to the screen, close enough that the screen fills the view
    const t = Math.tan((30 * Math.PI) / 360);
    const dFill = Math.max(0.5 / t, (a / 2) / (t * aspect)) * 1.0;
    startPos.set(0, 0, 0.055 + dFill); startLook.set(0, 0, 0);
  }

  const anim = { t: 1, dur: 1.2 };
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  let last = 0;

  return {
    scene, camera,
    /** start the pull-back reveal (instant with reduced motion) */
    enter() { anim.t = reduce ? 1 : 0; last = 0; },
    /** prepare the render target for the board view at the given CSS size; returns it */
    target(cw, ch, pr) {
      const na = cw / ch;
      if (!built || Math.abs(na - a) > 1e-3) { a = na; build(); fitKey = ''; }
      const s = Math.min(pr, 1400 / Math.max(cw, ch));
      const w = Math.max(2, Math.round(cw * s)), h = Math.max(2, Math.round(ch * s));
      if (!rt || w !== rtW || h !== rtH) {
        rt?.dispose();
        rt = new THREE.WebGLRenderTarget(w, h, { samples: renderer.capabilities.isWebGL2 ? 4 : 0, type: THREE.HalfFloatType });
        rtW = w; rtH = h;
        crtMat.uniforms.tBoard.value = rt.texture;
        crtMat.uniforms.uLines.value = Math.min(240, Math.max(120, h / 3));
      }
      crtMat.uniforms.uAsp.value.set(Math.min(1, a), Math.min(1, 1 / a));
      return rt;
    },
    /** per frame: camera pose (reveal animation), HUD texture refresh */
    update(now, aspect) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
      crtMat.uniforms.uTime.value = now / 1000;
      if (hudCanvas) hudTex.needsUpdate = true;
      if (camera.aspect !== aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
      solveFit(aspect);
      anim.t = Math.min(1, anim.t + dt / anim.dur);
      const k = ease(anim.t);
      camera.position.lerpVectors(startPos, endPos, k);
      fitV.lerpVectors(startLook, endLook, k);
      camera.lookAt(fitV);
      glow.intensity = 1.4 + Math.sin(now / 300) * 0.15;
    },
    animating: () => anim.t < 1,
    /** called once the pixel font / cart icon are ready so the signs pick them up */
    redrawArt() { built?.mq?.redraw(); built?.pt?.redraw(); },
    loadArt() {
      const img = svgImage(cartIcon(gameId), () => { icon.img = img; this.redrawArt(); });
      document.fonts?.load?.('40px "Press Start 2P"').then(() => this.redrawArt()).catch(() => {});
    },
    dispose() {
      rt?.dispose();
      if (built) { built.mats.forEach((m) => m.dispose()); built.geos.forEach((x) => x.dispose()); }
      disposables.forEach((d) => d.dispose());
    },
  };
}
