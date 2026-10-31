// Real-time 3D view of a running cart. The game's 2D draw calls (captured by capture.js) are rebuilt every
// frame as lit, shadowed meshes: rects -> blocks, circles -> spheres/discs, paths -> extruded prisms,
// strokes -> glowing bars. Later draws stack on top of earlier ones (a small height map), so sprites keep
// their details. Effects: bloom, motion trails, particles, shockwave rings, light flashes, screen shake.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { getTier, onTier, makeWatchdog, pixelRatio } from './quality.js';
import { onFx } from '../fx.js';
import { makeRig, FOV } from './camrig.js';

const MAX_BOX = 9000, MAX_BALL = 2500, MAX_GLASS = 1500, MAX_POLY_VERTS = 48000;
const CELL = 4;

// per-cart camera tilt (radians from straight down) and block height scale
const CFG = {
  snake: { tilt: 0.42, depth: 1 }, blockdrop: { tilt: 0.3, depth: 0.7 }, mazemunch: { tilt: 0.45, depth: 1 },
  starblaster: { tilt: 0.48, depth: 0.9 }, brickbash: { tilt: 0.42, depth: 0.9 }, froghop: { tilt: 0.46, depth: 0.9 },
  asteroiddrift: { tilt: 0.32, depth: 1 }, pixelpaddle: { tilt: 0.5, depth: 1 }, ladderclimb: { tilt: 0.3, depth: 0.8 },
  neonracer: { tilt: 0.62, depth: 1.1 }, moondrop: { tilt: 0.3, depth: 0.8 }, tankduel: { tilt: 0.5, depth: 1.2 },
};

function glowify(mat, amount) {
  mat.userData.glow = { value: amount };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = mat.userData.glow;
    sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
        float mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
        float sat = mx > 0.0 ? (mx - mn) / mx : 0.0;
        totalEmissiveRadiance += diffuseColor.rgb * uGlow * smoothstep(0.25, 0.9, mx) * (0.4 + 0.6 * sat); }`);
  };
  return mat;
}

const PARTICLE_VS = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
varying float vA; varying vec3 vC; uniform float uScale;
void main() { vA = alpha; vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`;
const PARTICLE_FS = `
varying float vA; varying vec3 vC;
void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
  gl_FragColor = vec4(vC * (1.6 - r), vA * (1.0 - r)); }`;

const FX_STYLE = {
  explode: { n: 70, speed: 260, life: 0.9, size: 9, colors: ['#fff3b0', '#ffb347', '#ff5e3a', '#ffffff'], ring: '#ffb347', light: '#ff9a3c', li: 5, shake: 5, up: 120 },
  boom: { n: 90, speed: 300, life: 1.0, size: 10, colors: ['#fff3b0', '#ffb347', '#ff5e3a'], ring: '#ff7b3a', light: '#ff8030', li: 6, shake: 7, up: 140 },
  hit: { n: 46, speed: 220, life: 0.7, size: 8, colors: ['#ff6b6b', '#ffd1d1', '#ffffff'], ring: '#ff4d6d', light: '#ff3355', li: 4, shake: 8, up: 90 },
  die: { n: 60, speed: 240, life: 0.8, size: 8, colors: ['#ff6b6b', '#ffe066', '#ffffff'], ring: '#ff4d6d', light: '#ff3355', li: 4, shake: 9, up: 100 },
  powerup: { n: 44, speed: 150, life: 1.0, size: 8, colors: ['#9bf6ff', '#caffbf', '#fdffb6', '#ffc6ff'], ring: '#9bf6ff', light: '#8ff7ff', li: 4, shake: 0, up: 160, rise: true },
  coin: { n: 22, speed: 120, life: 0.7, size: 7, colors: ['#ffe066', '#fff7c2'], light: '#ffe066', li: 2, shake: 0, up: 140, rise: true },
  eat: { n: 16, speed: 110, life: 0.5, size: 6, colors: ['#fff7c2', '#b8ffb0'], light: '#fffbb0', li: 1.5, shake: 0, up: 80 },
  splash: { n: 60, speed: 120, life: 1.0, size: 7, colors: ['#74b9ff', '#a8e6ff', '#ffffff'], ring: '#74b9ff', light: '#5aa9ff', li: 3, shake: 4, up: 230, water: true },
  bounce: { n: 8, speed: 90, life: 0.35, size: 5, colors: ['#ffffff', '#d0f4ff'], shake: 0, up: 40 },
  brick: { n: 24, speed: 170, life: 0.7, size: 6, colors: null, light: null, li: 1.5, shake: 1.5, up: 120 },
  shoot: { n: 6, speed: 60, life: 0.25, size: 5, colors: ['#ffffff', '#fdffb6'], shake: 0, up: 20 },
  clear: { n: 90, speed: 200, life: 0.9, size: 7, colors: ['#ffffff', '#a29bfe', '#9bf6ff', '#fdffb6'], ring: '#a29bfe', light: '#b8b0ff', li: 4, shake: 3, up: 150, wide: true },
  level: { n: 70, speed: 180, life: 1.2, size: 8, colors: ['#ffe066', '#9bf6ff', '#caffbf', '#ffc6ff'], ring: '#ffe066', light: '#ffffff', li: 3, shake: 0, up: 200, rise: true },
  land: { n: 40, speed: 120, life: 0.9, size: 7, colors: ['#caffbf', '#ffffff'], ring: '#55efc4', light: '#55efc4', li: 3, shake: 2, up: 60 },
  jump: { n: 8, speed: 70, life: 0.35, size: 5, colors: ['#ffffff'], shake: 0, up: 30 },
};

export function createGameView(host, cap, gameId, accent = '#33ff66') {
  let renderer;
  const canvas = document.createElement('canvas');
  canvas.className = 'gl3d';
  host.prepend(canvas);
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: getTier() !== 'low', powerPreference: 'high-performance', alpha: true });
  } catch (e) {
    canvas.remove();
    return null;
  }
  const cfg = CFG[gameId] || { tilt: 0.4, depth: 1 };
  const W = cap.W || 400, H = cap.H || 400;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, W / H, 1, 6000);
  renderer.setClearColor(0x05040a, 1);
  const NEON_FOG = new THREE.Fog(0x05040a, 1e5, 2e5);
  scene.fog = NEON_FOG;

  // —— lights ——
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x1a1020, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(-W * 0.35, Math.max(W, H) * 1.3, H * 0.55);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const sc = sun.shadow.camera;
  sc.left = -W * 0.7; sc.right = W * 0.7; sc.top = H * 0.7; sc.bottom = -H * 0.7; sc.near = 10; sc.far = Math.max(W, H) * 4;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0015;
  const flashLight = new THREE.PointLight(0xffffff, 0, Math.max(W, H) * 0.9, 1.6);
  scene.add(flashLight);

  // —— board + neon bezel ——
  const boardMat = new THREE.MeshLambertMaterial({ color: 0x000000 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(W, 8, H), boardMat);
  board.position.y = -4.01;
  board.receiveShadow = true;
  scene.add(board);
  const rimMat = glowify(new THREE.MeshLambertMaterial({ color: new THREE.Color(accent) }), 1.2);
  const bezelMat = new THREE.MeshLambertMaterial({ color: 0x15121c });
  const rim = new THREE.Group();
  const B = 10;
  [[W + B * 2, B, 0, -H / 2 - B / 2], [W + B * 2, B, 0, H / 2 + B / 2], [B, H, -W / 2 - B / 2, 0], [B, H, W / 2 + B / 2, 0]].forEach(([w, d, x, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 9, d), bezelMat);
    m.position.set(x, -3.5, z); rim.add(m);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w > d ? w : 1.6, 1.4, w > d ? 1.6 : d), rimMat);
    strip.position.set(x, 1.4, z); rim.add(strip);
  });
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 8, H * 8), new THREE.MeshLambertMaterial({ color: 0x0b0912 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -8.5; floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(Math.max(W, H) * 6, 60, new THREE.Color(accent).multiplyScalar(0.35), 0x1c1730);
  grid.position.y = -8.4;
  scene.add(grid);

  // —— instanced primitives ——
  const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);
  const lowPoly = getTier() === 'low';
  const ballGeo = new THREE.SphereGeometry(1, lowPoly ? 10 : 16, lowPoly ? 7 : 12);
  const discGeo = new THREE.CylinderGeometry(1, 1, 1, 28); discGeo.translate(0, 0.5, 0);
  const solidMat = glowify(new THREE.MeshLambertMaterial({ color: 0xffffff }), 0.32);
  const glassMat = glowify(new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), 0.4);
  const mk = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const boxes = mk(boxGeo, solidMat, MAX_BOX);
  const balls = mk(ballGeo, solidMat, MAX_BALL);
  const discs = mk(discGeo, solidMat, 400);
  const glass = mk(boxGeo, glassMat, MAX_GLASS);
  glass.castShadow = false;

  const polyGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_POLY_VERTS * 3), pNor = new Float32Array(MAX_POLY_VERTS * 3), pCol = new Float32Array(MAX_POLY_VERTS * 3);
  polyGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  polyGeo.setAttribute('normal', new THREE.BufferAttribute(pNor, 3).setUsage(THREE.DynamicDrawUsage));
  polyGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  const polyMesh = new THREE.Mesh(polyGeo, glowify(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.32));
  polyMesh.frustumCulled = false; polyMesh.castShadow = true; polyMesh.receiveShadow = true;
  scene.add(polyMesh);

  // —— particles ——
  const PN = 900;
  const parts = { pos: new Float32Array(PN * 3), col: new Float32Array(PN * 3), size: new Float32Array(PN), alpha: new Float32Array(PN), vel: new Float32Array(PN * 3), life: new Float32Array(PN), max: new Float32Array(PN), grav: new Float32Array(PN), next: 0 };
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(parts.pos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('pcolor', new THREE.BufferAttribute(parts.col, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('size', new THREE.BufferAttribute(parts.size, 1).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('alpha', new THREE.BufferAttribute(parts.alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const pMat = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, uniforms: { uScale: { value: 300 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);

  const rings = [];
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    r.rotation.x = -Math.PI / 2; r.visible = false; r.userData = { t: 1 };
    scene.add(r); rings.push(r);
  }

  // —— post-processing ——
  let composer = null, bloom = null, trails = null;
  function setupTier() {
    const t = getTier();
    renderer.setPixelRatio(pixelRatio());
    renderer.shadowMap.enabled = t === 'high';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    sun.castShadow = t === 'high';
    [solidMat, glassMat, polyMesh.material, boardMat, floor.material].forEach((m) => { m.needsUpdate = true; });
    composer?.dispose?.();
    composer = null; bloom = null; trails = null;
    if (t !== 'low') {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      if (t === 'high') { trails = new AfterimagePass(0.38); composer.addPass(trails); }
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), t === 'high' ? 0.6 : 0.5, 0.4, 0.78);
      // add the glow to rgb only and keep the scene's alpha, so a transparent clear (page backdrop) stays see-through
      const bm = bloom.blendMaterial;
      if (bm) {
        bm.blending = THREE.CustomBlending; bm.blendEquation = bm.blendEquationAlpha = THREE.AddEquation;
        bm.blendSrc = THREE.SrcAlphaFactor; bm.blendDst = THREE.OneFactor;
        bm.blendSrcAlpha = THREE.ZeroFactor; bm.blendDstAlpha = THREE.OneFactor;
      }
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }
    resize(true);
    world?.setTier?.(t);
    if (world && bloom) { bloom.strength = 0.42; bloom.threshold = 0.86; bloom.radius = 0.55; }
  }

  let cw = 0, ch = 0;
  function resize(force) {
    const w = Math.max(2, Math.round(host.clientWidth - 6)), h = Math.max(2, Math.round(host.clientHeight - 6));
    if (!force && w === cw && h === ch) return;
    cw = w; ch = h;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(pixelRatio());
      composer.setSize(w, h);
      const s = getTier() === 'high' ? 0.5 : 0.35;
      bloom?.resolution.set(w * s, h * s);
    }
    pMat.uniforms.uScale.value = h * pixelRatio() * 1.6;
  }

  // camera pose that fits the whole board (incl. near edge + neon bezel) inside the canvas.
  // Solved from the board's corner points and the real camera frustum for the current aspect:
  // binary search on distance, with the look point re-centred so the tilted trapezoid sits mid-screen.
  const FIT_MARGIN = 0.92; // NDC extent used (leaves ~4% margin on each side for sway / shake)
  const fitPts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [-8.5, 3, 14]) fitPts.push(new THREE.Vector3(sx * (W / 2 + B + 2), y, sz * (H / 2 + B + 2)));
  const fitCam = new THREE.PerspectiveCamera(30, 1, 1, 1e6);
  const fitV = new THREE.Vector3();
  let fitKey = '', fitD = 1, fitLookZ = 0;
  function extent(d, lookZ, tilt) {
    fitCam.position.set(0, d * Math.cos(tilt), d * Math.sin(tilt) + lookZ);
    fitCam.lookAt(0, 0, lookZ);
    fitCam.updateMatrixWorld(true);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of fitPts) {
      fitV.copy(p).project(fitCam);
      if (fitV.z > 1) return null; // behind the camera
      x0 = Math.min(x0, fitV.x); x1 = Math.max(x1, fitV.x); y0 = Math.min(y0, fitV.y); y1 = Math.max(y1, fitV.y);
    }
    return { x0, x1, y0, y1 };
  }
  function solveFit() {
    const a = camera.aspect, tilt = cfg.tilt, key = a.toFixed(4);
    if (key === fitKey) return;
    fitKey = key;
    fitCam.aspect = a; fitCam.updateProjectionMatrix();
    const R = Math.hypot(W, H);
    let lookZ = 0, d = R * 3;
    for (let it = 0; it < 6; it++) {
      let lo = R * 0.3, hi = R * 40;
      for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2, e = extent(m, lookZ, tilt);
        if (!e || Math.max(-e.x0, e.x1) > FIT_MARGIN || Math.max(-e.y0, e.y1) > FIT_MARGIN) lo = m; else hi = m;
      }
      d = hi;
      // re-centre vertically: move the look point toward the side that has spare room
      const e = extent(d, lookZ, tilt);
      const off = (e.y1 + e.y0) / 2; // >0: content sits high -> look further away (−z)
      if (Math.abs(off) < 0.004) break;
      lookZ -= off * (H / 2) * 0.9;
    }
    fitD = d; fitLookZ = lookZ;
  }
  function basePose(out) {
    solveFit();
    const tilt = cfg.tilt;
    out.set(0, fitD * Math.cos(tilt), fitD * Math.sin(tilt) + fitLookZ);
    return out;
  }
  const lookZ = () => (solveFit(), fitLookZ);

  // —— effects state ——
  let shake = 0, flashI = 0;
  const intro = { t: 0, dur: 0.9, active: true, dir: 1, done: null };
  const tmpC = new THREE.Color();
  function spawn(ev) {
    const st = FX_STYLE[ev.kind];
    if (!st) return;
    const t = getTier();
    const mult = t === 'high' ? 1 : t === 'mid' ? 0.6 : 0.35;
    const x = (Number.isFinite(ev.x) ? ev.x : W / 2) - W / 2, z = (Number.isFinite(ev.y) ? ev.y : H / 2) - H / 2;
    const n = Math.round(st.n * mult * (ev.scale || 1));
    const colors = ev.color ? [ev.color, '#ffffff'] : st.colors || ['#ffffff'];
    for (let i = 0; i < n; i++) {
      const k = parts.next; parts.next = (parts.next + 1) % PN;
      const a = Math.random() * Math.PI * 2, sp = st.speed * (0.25 + Math.random() * 0.75) * (ev.scale || 1);
      const ox = st.wide ? (Math.random() - 0.5) * W * 0.9 : 0;
      parts.pos[k * 3] = x + ox; parts.pos[k * 3 + 1] = 4 + Math.random() * 6; parts.pos[k * 3 + 2] = z;
      parts.vel[k * 3] = Math.cos(a) * sp * (st.water ? 0.4 : 1);
      parts.vel[k * 3 + 1] = st.up * (0.4 + Math.random() * 0.9);
      parts.vel[k * 3 + 2] = Math.sin(a) * sp * (st.water ? 0.4 : 1);
      parts.grav[k] = st.rise ? 60 : st.water ? 520 : 380;
      parts.max[k] = parts.life[k] = st.life * (0.6 + Math.random() * 0.6);
      parts.size[k] = st.size * (0.6 + Math.random() * 0.8);
      tmpC.set(colors[i % colors.length]);
      parts.col[k * 3] = tmpC.r; parts.col[k * 3 + 1] = tmpC.g; parts.col[k * 3 + 2] = tmpC.b;
    }
    if (st.ring && t !== 'low') {
      const r = rings.find((q) => q.userData.t >= 1) || rings[0];
      r.position.set(x, 2, z); r.material.color.set(ev.color || st.ring); r.userData.t = 0; r.userData.max = (st.wide ? W * 0.5 : 48) * (ev.scale || 1); r.visible = true;
    }
    if (st.light && !ev.noLight) { flashLight.color.set(ev.color || st.light); flashLight.position.set(x, 36, z); flashI = Math.max(flashI, st.li * 4000); }
    if (st.shake) shake = Math.max(shake, st.shake * (ev.scale || 1));
  }
  const offFx = onFx(spawn);

  // —— build meshes from captured ops ——
  const gw = Math.ceil(W / CELL) + 1, gh = Math.ceil(H / CELL) + 1;
  const hm = new Float32Array(gw * gh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const cellRange = (x0, y0, x1, y1) => [Math.max(0, Math.floor(x0 / CELL)), Math.max(0, Math.floor(y0 / CELL)), Math.min(gw - 1, Math.floor(x1 / CELL)), Math.min(gh - 1, Math.floor(y1 / CELL))];
  function sample(x0, y0, x1, y1) {
    const [a, b, c, d] = cellRange(x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5);
    let m = 0;
    for (let j = b; j <= d; j++) for (let i = a; i <= c; i++) { const v = hm[j * gw + i]; if (v > m) m = v; }
    return m;
  }
  function raise(x0, y0, x1, y1, top) {
    const [a, b, c, d] = cellRange(x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5);
    for (let j = b; j <= d; j++) for (let i = a; i <= c; i++) { const k = j * gw + i; if (hm[k] < top) hm[k] = top; }
  }
  const setCol = (c) => col.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

  let nb, nball, ndisc, ng, pv;
  function pushBox(cx, base, cz, w, hgt, d, c, a, rotY = 0) {
    const mesh = a < 0.85 ? glass : boxes;
    const idx = a < 0.85 ? ng : nb;
    if (idx >= (a < 0.85 ? MAX_GLASS : MAX_BOX)) return;
    q.setFromAxisAngle(up, rotY);
    m4.compose(v3.set(cx - W / 2, base, cz - H / 2), q, s3.set(Math.max(0.3, w), Math.max(0.3, hgt), Math.max(0.3, d)));
    mesh.setMatrixAt(idx, m4); mesh.setColorAt(idx, setCol(c));
    if (a < 0.85) ng++; else nb++;
  }
  function polyTri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz) {
    if (pv + 3 > MAX_POLY_VERTS) return;
    const o = pv * 3;
    pPos[o] = ax; pPos[o + 1] = ay; pPos[o + 2] = az;
    pPos[o + 3] = bx; pPos[o + 4] = by; pPos[o + 5] = bz;
    pPos[o + 6] = cx; pPos[o + 7] = cy; pPos[o + 8] = cz;
    for (let i = 0; i < 3; i++) { pNor[o + i * 3] = nx; pNor[o + i * 3 + 1] = ny; pNor[o + i * 3 + 2] = nz; pCol[o + i * 3] = col.r; pCol[o + i * 3 + 1] = col.g; pCol[o + i * 3 + 2] = col.b; }
    pv += 3;
  }
  const v2 = (p) => new THREE.Vector2(p[0], p[1]);
  function build(ops) {
    hm.fill(0);
    nb = nball = ndisc = ng = pv = 0;
    const area = W * H, depth = cfg.depth;
    const finite = (pts) => pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    for (const op of ops) {
      if ((op.t === 'poly' || op.t === 'line') && !finite(op.pts)) continue;
      if (op.t === 'line' && op.closed && op.pts.length >= 3) {
        // closed outlines (rocks, ships) get a dark solid body so vector games read as 3D objects
        let a2 = 0; for (let i = 0; i < op.pts.length; i++) { const p = op.pts[i], n = op.pts[(i + 1) % op.pts.length]; a2 += p[0] * n[1] - n[0] * p[1]; }
        const ar = Math.abs(a2) / 2;
        if (ar > 6 && ar < area * 0.18) handle({ t: 'poly', pts: op.pts, c: [op.c[0] * 0.28, op.c[1] * 0.28, op.c[2] * 0.28], a: 1 });
      }
      handle(op);
    }
    function handle(op) {
      if (op.t === 'rect') {
        const { x, y, w, h } = op;
        if (!(w > 0 && h > 0) || !Number.isFinite(x + y + w + h)) return;
        const big = w * h >= area * 0.18;
        const mn = Math.min(w, h), mx = Math.max(w, h);
        let hgt = big ? 0.8 : mn < 3 && mx > 24 ? 1.6 : Math.min(16, Math.max(1.4, mn * 0.85)) * depth;
        // sample/raise only the rect's interior so side-by-side tiles (Block Drop cells, bricks) don't
        // stack onto their neighbours through the 4px height map and end up at uneven heights
        const ins = Math.min(2.5, mn * 0.2);
        const base = Math.min(60, sample(x + ins, y + ins, x + w - ins, y + h - ins));
        pushBox(x + w / 2, base, y + h / 2, w, hgt, h, op.c, op.a);
        raise(x + ins, y + ins, x + w - ins, y + h - ins, base + hgt);
      } else if (op.t === 'circle') {
        const { x, y, r } = op;
        if (!(r > 0.2) || !Number.isFinite(x + y + r)) return;
        const base = Math.min(60, sample(x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7));
        setCol(op.c);
        if (r > Math.min(W, H) * 0.12) {
          if (ndisc < 400) { m4.compose(v3.set(x - W / 2, base, y - H / 2), q.identity(), s3.set(r, 1.2, r)); discs.setMatrixAt(ndisc, m4); discs.setColorAt(ndisc++, col); }
          raise(x - r, y - r, x + r, y + r, base + 1.2);
        } else {
          const ry = r * 0.9 * depth;
          if (nball < MAX_BALL) { m4.compose(v3.set(x - W / 2, base + ry, y - H / 2), q.identity(), s3.set(r, ry, r)); balls.setMatrixAt(nball, m4); balls.setColorAt(nball++, col); }
          raise(x - r, y - r, x + r, y + r, base + ry * 2);
        }
      } else if (op.t === 'poly') {
        const pts = op.pts;
        let a2 = 0, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], n = pts[(i + 1) % pts.length];
          a2 += p[0] * n[1] - n[0] * p[1];
          if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
        }
        const ar = Math.abs(a2) / 2;
        if (ar < 0.5) return;
        const hgt = ar >= area * 0.18 ? 0.8 : Math.min(12, Math.max(1.5, Math.sqrt(ar) * 0.45)) * depth;
        const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, qx = (maxx - minx) * 0.25, qy = (maxy - miny) * 0.25;
        const base = Math.min(60, sample(cx - qx, cy - qy, cx + qx, cy + qy));
        const top = base + hgt;
        setCol(op.c);
        let tris;
        try { tris = THREE.ShapeUtils.triangulateShape(pts.map(v2), []); } catch { return; }
        const X = (p) => p[0] - W / 2, Z = (p) => p[1] - H / 2;
        for (const [i, j, k] of tris) polyTri(X(pts[i]), top, Z(pts[i]), X(pts[j]), top, Z(pts[j]), X(pts[k]), top, Z(pts[k]), 0, 1, 0);
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], n = pts[(i + 1) % pts.length];
          const dx = n[0] - p[0], dz = n[1] - p[1], L = Math.hypot(dx, dz) || 1;
          const nx = dz / L * Math.sign(a2), nz = -dx / L * Math.sign(a2);
          polyTri(X(p), base, Z(p), X(n), base, Z(n), X(n), top, Z(n), nx, 0, nz);
          polyTri(X(p), base, Z(p), X(n), top, Z(n), X(p), top, Z(p), nx, 0, nz);
        }
        // big shapes (terrain, floors) lift everything drawn on them; small sprites only their middle
        if (ar > area * 0.05) raise(minx, miny, maxx, maxy, top);
        else raise(minx + qx, miny + qy, maxx - qx, maxy - qy, top);
      } else if (op.t === 'line') {
        const pts = op.pts, n = op.closed ? pts.length : pts.length - 1;
        const th = Math.max(1.2, op.lw || 1);
        const hgt = Math.max(2, th * 1.4) * depth;
        for (let i = 0; i < n; i++) {
          const p = pts[i], e = pts[(i + 1) % pts.length];
          const dx = e[0] - p[0], dy = e[1] - p[1], L = Math.hypot(dx, dy);
          if (L < 0.2) continue;
          const mx = (p[0] + e[0]) / 2, my = (p[1] + e[1]) / 2;
          const base = Math.min(60, sample(mx - 1, my - 1, mx + 1, my + 1));
          pushBox(mx, base, my, L + th * 0.6, hgt, th, op.c, op.a, -Math.atan2(dy, dx));
        }
      }
    }
    boxes.count = nb; balls.count = nball; discs.count = ndisc; glass.count = ng;
    for (const m of [boxes, balls, discs, glass]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    polyGeo.setDrawRange(0, pv);
    polyGeo.attributes.position.needsUpdate = polyGeo.attributes.normal.needsUpdate = polyGeo.attributes.color.needsUpdate = true;
    if (cap.bg) boardMat.color.setRGB(cap.bg[0], cap.bg[1], cap.bg[2], THREE.SRGBColorSpace);
  }

  const pose = new THREE.Vector3(), from = new THREE.Vector3();
  const tgtPos = new THREE.Vector3(), tgtLook = new THREE.Vector3(), tgtUp = new THREE.Vector3(0, 1, 0);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0);
  const tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3(), tmpU = new THREE.Vector3();
  const rig = makeRig(gameId, W, H);
  let camMode = 'classic', avatarFn = null, fovNow = 30;
  let world = null, worldName = 'neon', worldLoading = null;
  let backdropOn = false; // animated page backdrop shows through: transparent clear, no floor/grid
  function applyBackdrop() {
    floor.visible = grid.visible = !backdropOn && !world;
    renderer.setClearColor(0x05040a, backdropOn ? 0 : 1);
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  let last = 0, frames = 0, fpsT0 = 0, fps = 0;
  const watchdog = makeWatchdog();
  const offTier = onTier(() => setupTier());

  function render(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    watchdog(now);
    frames++; if (!fpsT0) fpsT0 = now; else if (now - fpsT0 >= 1000) { fps = Math.round((frames * 1000) / (now - fpsT0)); frames = 0; fpsT0 = now; }
    resize(false);
    if (cap.mode3d && !world) build(cap.ops);

    // camera: intro swoop / outro, then a damped follow of the active rig (classic sway, chase, first person)
    basePose(pose);
    tgtPos.set(pose.x + Math.sin(now / 2600) * W * 0.012, pose.y, pose.z);
    tgtLook.set(0, 0, lookZ()); tgtUp.set(0, 1, 0);
    let mode = camMode;
    if (mode !== 'classic') {
      let av = null;
      try { av = avatarFn?.() || null; } catch { av = null; }
      if (!rig.target(mode, av, dt, now, tmpP, tmpL, tmpU)) mode = 'classic';
      else { tgtPos.copy(tmpP); tgtLook.copy(tmpL); tgtUp.copy(tmpU); }
    }
    const wantFov = FOV[mode] || 30;
    if (intro.active) {
      intro.t = Math.min(1, intro.t + dt / intro.dur);
      const k = intro.dir > 0 ? ease(intro.t) : 1 - ease(intro.t);
      from.set(pose.x * 0.2 + W * 0.25, pose.y * 2.2, pose.z * 0.2 - H * 0.6);
      camPos.lerpVectors(from, tgtPos, k);
      camLook.set(0, 0, lookZ() + (1 - k) * -H * 0.1).lerp(tgtLook, k);
      camUp.copy(tgtUp);
      fovNow = 30 + (wantFov - 30) * k;
      if (intro.t >= 1) { intro.active = false; intro.done?.(); intro.done = null; }
    } else {
      const kp = 1 - Math.exp(-dt * (mode === 'classic' ? 6 : 7));
      camPos.lerp(tgtPos, kp); camLook.lerp(tgtLook, kp); camUp.lerp(tgtUp, kp).normalize();
      fovNow += (wantFov - fovNow) * (1 - Math.exp(-dt * 4));
    }
    if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
    camera.position.copy(camPos);
    camera.up.copy(camUp);
    if (shake > 0.05) {
      const sk = mode === 'classic' ? 1 : 0.3; // keep close cameras calm
      camera.position.x += (Math.random() - 0.5) * shake * 2 * sk;
      camera.position.y += (Math.random() - 0.5) * shake * sk;
      camera.position.z += (Math.random() - 0.5) * shake * 2 * sk;
      shake *= Math.exp(-dt * 9);
    }
    camera.lookAt(camLook);
    // close cameras get a soft distance fog so the floor fades into the dark instead of ending at a hard edge
    const fogFar = mode === 'classic' ? 2e5 : Math.max(W, H) * 2.4;
    if (scene.fog === NEON_FOG) { NEON_FOG.far += (fogFar - NEON_FOG.far) * (1 - Math.exp(-dt * 3)); NEON_FOG.near = NEON_FOG.far * 0.35; }
    world?.update(dt, now, camera, mode);

    // particles
    let alive = 0;
    for (let k = 0; k < PN; k++) {
      if (parts.life[k] <= 0) { parts.alpha[k] = 0; continue; }
      alive++;
      parts.life[k] -= dt;
      parts.vel[k * 3 + 1] -= parts.grav[k] * dt;
      parts.pos[k * 3] += parts.vel[k * 3] * dt;
      parts.pos[k * 3 + 1] = Math.max(0.5, parts.pos[k * 3 + 1] + parts.vel[k * 3 + 1] * dt);
      parts.pos[k * 3 + 2] += parts.vel[k * 3 + 2] * dt;
      parts.alpha[k] = Math.max(0, parts.life[k] / parts.max[k]);
    }
    pGeo.attributes.position.needsUpdate = pGeo.attributes.alpha.needsUpdate = pGeo.attributes.pcolor.needsUpdate = pGeo.attributes.size.needsUpdate = true;
    points.visible = alive > 0;
    for (const r of rings) {
      if (r.userData.t >= 1) { r.visible = false; continue; }
      r.userData.t = Math.min(1, r.userData.t + dt * 2.2);
      const s = 4 + ease(r.userData.t) * r.userData.max;
      r.scale.set(s, s, s);
      r.material.opacity = (1 - r.userData.t) * 0.9;
    }
    flashLight.intensity = flashI * (camMode === 'classic' ? 1 : 0.18);
    if (trails) trails.enabled = camMode === 'classic' && !world; // a moving camera would smear the whole frame
    flashI *= Math.exp(-dt * 7);
    rimMat.userData.glow.value = 1.1 + Math.sin(now / 400) * 0.25;

    if (composer) composer.render(dt); else renderer.render(scene, camera);
  }

  setupTier();
  basePose(pose);
  camera.position.copy(pose);
  camPos.copy(pose);
  camLook.set(0, 0, lookZ());
  camera.lookAt(camLook);

  // —— optional themed world (Snake: FANTASY), lazy-loaded so the neon carts never download it ——
  const neonParts = [board, rim, floor, grid, boxes, balls, discs, glass, polyMesh];
  function setWorld(name) {
    if (name === worldName && (world || name === 'neon')) return Promise.resolve(worldName);
    worldName = name;
    if (name !== 'fantasy' || gameId !== 'snake') {
      world?.dispose(); world = null;
      neonParts.forEach((o) => { o.visible = true; });
      applyBackdrop();
      scene.fog = NEON_FOG; scene.background = null;
      renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
      sun.visible = true; hemi.visible = true;
      if (bloom) { bloom.strength = getTier() === 'high' ? 0.6 : 0.5; bloom.threshold = 0.78; }
      [solidMat, glassMat, polyMesh.material, boardMat, floor.material].forEach((m) => { m.needsUpdate = true; });
      return Promise.resolve('neon');
    }
    const ticket = (worldLoading = import('./fantasy.js').then((m) => {
      if (worldLoading !== ticket || worldName !== 'fantasy') return worldName;
      world?.dispose();
      world = m.createFantasy({ THREE, scene, renderer, W, H, tier: getTier(), getState: () => stateFn?.() });
      neonParts.forEach((o) => { o.visible = false; });
      sun.visible = false; hemi.visible = false;
      if (bloom) { bloom.strength = 0.42; bloom.threshold = 0.86; bloom.radius = 0.55; }
      return 'fantasy';
    }));
    return ticket;
  }
  let stateFn = null;

  return {
    canvas,
    render,
    resize: () => resize(true),
    shake(a) { shake = Math.max(shake, a); },
    flash(kind) {
      if (kind === 'die') { shake = Math.max(shake, 7); flashLight.color.set('#ff3355'); flashLight.position.set(0, 60, 0); flashI = Math.max(flashI, 26000); }
      else if (kind === 'clear') { flashLight.color.set('#b8c8ff'); flashLight.position.set(0, 60, 0); flashI = Math.max(flashI, 16000); }
    },
    outro() {
      return new Promise((res) => { intro.t = 0; intro.dur = 0.38; intro.dir = -1; intro.active = true; intro.done = res; });
    },
    /** Board + bezel bounding box in CSS px of the GL canvas (current camera), or null if part of it is behind the camera. */
    boardRect() {
      camera.updateMatrixWorld(true);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const q of fitPts) {
        fitV.copy(q).project(camera);
        if (fitV.z > 1 || fitV.z < -1) return null;
        x0 = Math.min(x0, fitV.x); x1 = Math.max(x1, fitV.x); y0 = Math.min(y0, fitV.y); y1 = Math.max(y1, fitV.y);
      }
      return { left: (x0 + 1) / 2 * cw, right: (x1 + 1) / 2 * cw, top: (1 - y1) / 2 * ch, bottom: (1 - y0) / 2 * ch, w: cw, h: ch };
    },
    setCamMode(m) { camMode = m; },
    /** true: the page backdrop (src/backdrop.js) shows behind the board instead of the dark floor */
    setBackdrop(on) { backdropOn = !!on; applyBackdrop(); },
    getCamMode: () => camMode,
    setAvatar(fn) { avatarFn = fn; },
    setState(fn) { stateFn = fn; },
    setWorld,
    getWorld: () => (world ? 'fantasy' : 'neon'),
    stats: () => ({ live: (() => { let m = 0; camera.updateMatrixWorld(true); for (const q of fitPts) { fitV.copy(q).project(camera); m = Math.max(m, Math.abs(fitV.x), Math.abs(fitV.y)); } return +m.toFixed(3); })(), fit: (() => { const e = extent(fitD, fitLookZ, cfg.tilt); return e && [e.x0, e.x1, e.y0, e.y1].map((v) => +v.toFixed(3)); })(), world: world ? 'fantasy' : 'neon', cam: camMode, fov: Math.round(camera.fov), prims: (boxes.count || 0) + (balls.count || 0) + (discs.count || 0) + (glass.count || 0) + Math.floor(pv / 3), tier: getTier(), fps, particles: points.visible }),
    dispose() {
      offFx(); offTier();
      worldLoading = null; world?.dispose(); world = null;
      composer?.dispose?.();
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
