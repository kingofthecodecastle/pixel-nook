// Snake "Fantasy World": a stone-paved arena on a floating cliff at sunset, with ruins, ivy, distant
// mountains, waterfalls with mist, fake god rays and fog, a scaly snake and glossy glowing apples.
// Everything is generated in code (textures, meshes, particles): no downloaded assets.
import * as THREE from 'three';

// —— tiny procedural toolkit ——
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4, s = 0) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 17); f *= 2; a *= 0.5; } return v / (1 - Math.pow(0.5, oct)); }
// tileable fbm (period p in noise cells)
function tnoise(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (n) => ((n % p) + p) % p;
  const a = hash2(m(xi), m(yi), s), b = hash2(m(xi + 1), m(yi), s), c = hash2(m(xi), m(yi + 1), s), d = hash2(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function tfbm(x, y, p, oct, s) { let v = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < oct; i++) { v += a * tnoise(x * f, y * f, p * f, s + i * 31); t += a; f *= 2; a *= 0.5; } return v / t; }

function canvas2d(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
/** height map (Float32, 0..1, tileable) -> tangent-space normal map texture */
function normalTex(hm, w, h, strength) {
  const [c, g] = canvas2d(w, h); const img = g.createImageData(w, h); const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = hm[y * w + ((x - 1 + w) % w)], r = hm[y * w + ((x + 1) % w)], t = hm[((y - 1 + h) % h) * w + x], b = hm[((y + 1) % h) * w + x];
    let nx = (l - r) * strength, ny = (t - b) * strength, nz = 1; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    const o = (y * w + x) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function colorTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
const mix = (a, b, t) => a + (b - a) * t;
const sat = (v) => Math.max(0, Math.min(1, v));

// Flagstone paving: irregular stones (jittered cells) with mossy mortar.
function pavingTextures(size) {
  const N = 8, cs = size / N, R = rng(7);
  const pts = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([(i + 0.2 + R() * 0.6) * cs, (j + 0.2 + R() * 0.6) * cs, R(), R()]);
  const hm = new Float32Array(size * size);
  const [c, g] = canvas2d(size, size); const img = g.createImageData(size, size); const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let d1 = 1e9, d2 = 1e9, id = 0;
    const ci = Math.floor(x / cs), cj = Math.floor(y / cs);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = (ci + di + N) % N, jj = (cj + dj + N) % N, p = pts[jj * N + ii];
      const px = p[0] + (ci + di - ii) * cs, py = p[1] + (cj + dj - jj) * cs;
      const dd = Math.hypot(x - px, y - py);
      if (dd < d1) { d2 = d1; d1 = dd; id = jj * N + ii; } else if (dd < d2) d2 = dd;
    }
    const edge = (d2 - d1) / cs;                // 0 at the seam between two stones
    const n = tfbm(x / size * 16, y / size * 16, 16, 4, 3);
    const stone = sat((edge - 0.05) / 0.09);
    const bevel = sat(edge / 0.22);
    const p = pts[id];
    hm[y * size + x] = stone * (0.55 + 0.35 * Math.sqrt(bevel)) + n * 0.12;
    const moss = sat((1 - stone) * 1.3 + (tfbm(x / size * 6, y / size * 6, 6, 3, 9) - 0.62) * 2.2);
    // warm sandstone / grey stones, each slightly different
    let r = mix(150, 196, p[2]) * (0.78 + n * 0.4), gg = mix(132, 172, p[2]) * (0.78 + n * 0.38), b = mix(112, 140, p[3]) * (0.78 + n * 0.36);
    if (stone < 1) { const k = 1 - stone; r = mix(r, 52, k); gg = mix(gg, 46, k); b = mix(b, 38, k); }
    r = mix(r, 70, moss * 0.85); gg = mix(gg, 104, moss * 0.85); b = mix(b, 40, moss * 0.85);
    const o = (y * size + x) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: colorTex(c), normalMap: normalTex(hm, size, size, size / 64) };
}

// Overlapping snake scales; v=0.75 band (belly) is paler.
function scaleTextures(size) {
  const hm = new Float32Array(size * size);
  const [c, g] = canvas2d(size, size); const img = g.createImageData(size, size); const d = img.data;
  const rows = 16, cols = 8;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * cols, v = y / size * rows;
    const row = Math.floor(v), off = (row % 2) * 0.5;
    const cx = Math.floor(u + off) - off + 0.5, cy = row + 0.5;
    let dx = u - cx, dy = (v - cy) * 1.1;
    let k = Math.hypot(dx, dy) * 1.9;            // 0 centre .. ~1 rim
    const sc = sat(1 - k);
    const ridge = Math.pow(sc, 0.6);
    hm[y * size + x] = ridge * 0.9 + (dx * 0.25);
    const vv = y / size, belly = sat(1 - Math.abs(vv - 0.75) / 0.13), back = sat(1 - Math.abs(vv - 0.25) / 0.12);
    const n = tfbm(x / size * 8, y / size * 8, 8, 3, 5);
    let r = mix(28, 92, ridge), gg = mix(60, 150, ridge), b = mix(30, 58, ridge);
    // gold rim highlights + dark diamond pattern along the back
    const rim = sat((k - 0.72) / 0.2) * (1 - sat((k - 0.98) / 0.1));
    r += rim * 70; gg += rim * 55;
    const diamond = back * (0.5 + 0.5 * Math.sin(x / size * Math.PI * 2 * 4)) ;
    r = mix(r, 22, diamond * 0.7); gg = mix(gg, 44, diamond * 0.7); b = mix(b, 26, diamond * 0.7);
    r = mix(r, 214, belly * 0.85); gg = mix(gg, 196, belly * 0.85); b = mix(b, 120, belly * 0.85);
    r *= 0.85 + n * 0.3; gg *= 0.85 + n * 0.3; b *= 0.85 + n * 0.3;
    const o = (y * size + x) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: colorTex(c), normalMap: normalTex(hm, size, size, size / 40) };
}

function rockTexture(size) {
  const [c, g] = canvas2d(size, size); const img = g.createImageData(size, size); const d = img.data;
  const hm = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = tfbm(x / size * 8, y / size * 8, 8, 5, 21), m = tfbm(x / size * 3, y / size * 3, 3, 3, 4);
    const strata = 0.5 + 0.5 * Math.sin((y / size) * Math.PI * 2 * 6 + n * 4);
    hm[y * size + x] = n * 0.8 + strata * 0.2;
    const v = 0.65 + n * 0.5 + strata * 0.08;
    let r = 168 * v, gg = 150 * v, b = 128 * v;
    const moss = sat((m - 0.58) * 3.5);
    r = mix(r, 72, moss); gg = mix(gg, 108, moss); b = mix(b, 46, moss);
    const o = (y * size + x) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: colorTex(c), normalMap: normalTex(hm, size, size, size / 48) };
}

function glowTexture() {
  const [c, g] = canvas2d(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function cloudTexture(size) {
  const [c, g] = canvas2d(size, size); const img = g.createImageData(size, size); const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = tfbm(x / size * 5, y / size * 5, 5, 5, 77);
    const a = sat((n - 0.42) * 2.4);
    const o = (y * size + x) * 4; d[o] = 255; d[o + 1] = 236 - a * 30; d[o + 2] = 220 - a * 50; d[o + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FS = `varying vec3 vDir; uniform vec3 uSun;
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 top = vec3(0.10,0.16,0.38), mid = vec3(0.62,0.38,0.46), hor = vec3(1.0,0.62,0.36), low = vec3(0.55,0.36,0.40);
  vec3 c = h > 0.0 ? mix(hor, mix(mid, top, smoothstep(0.18,0.75,h)), smoothstep(0.0,0.2,h)) : mix(hor, low, smoothstep(0.0,-0.35,h));
  float s = max(dot(d, uSun), 0.0);
  c += vec3(1.0,0.72,0.42) * pow(s, 8.0) * 0.55 + vec3(1.0,0.86,0.62) * pow(s, 90.0) * 1.4 + vec3(1.0,0.95,0.85) * smoothstep(0.9993,0.9997,s) * 3.0;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const FALL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FALL_FS = `varying vec2 vUv; uniform float uT; uniform float uSeed;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){ vec2 uv = vUv; float y = uv.y * 6.0 + uT * 1.6;
  float s = n(vec2(uv.x * 22.0 + uSeed, y)) * 0.6 + n(vec2(uv.x * 55.0, y * 2.3 + uSeed)) * 0.4;
  float edge = smoothstep(0.0, 0.18, uv.x) * smoothstep(1.0, 0.82, uv.x);
  float fade = smoothstep(0.0, 0.25, uv.y) * smoothstep(1.0, 0.96, uv.y);
  vec3 c = mix(vec3(0.55,0.72,0.86), vec3(1.0,0.96,0.92), smoothstep(0.45, 0.85, s));
  gl_FragColor = vec4(c, (0.35 + 0.6 * s) * edge * fade); }`;

const MIST_VS = `attribute float size; attribute float alpha; varying float vA; uniform float uScale;
void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`;
const MIST_FS = `varying float vA; uniform vec3 uColor; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(uColor, vA * (1.0 - r) * (1.0 - r)); }`;

export function createFantasy({ scene, renderer, W, H, tier: tier0, getState }) {
  let tier = tier0;
  const hi = () => tier === 'high', lo = () => tier === 'low';
  const root = new THREE.Group(); root.name = 'fantasy';
  scene.add(root);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const R = rng(1234);
  const S = Math.max(W, H);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const prevFog = scene.fog;
  scene.fog = new THREE.FogExp2(0xdc9272, 0.00025);
  const sunDir = new THREE.Vector3(-0.42, 0.2, -1).normalize();

  // —— sky ——
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(4500, 32, 16)), keep(new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: { uSun: { value: sunDir } }, side: THREE.BackSide, depthWrite: false, fog: false })));
  sky.renderOrder = -10; sky.frustumCulled = false;
  root.add(sky);

  // —— lights ——
  const hemi = new THREE.HemisphereLight(0xffd8c0, 0x3c4660, 1.0);
  const sun = new THREE.DirectionalLight(0xffc48a, 3.0);
  sun.position.copy(sunDir).multiplyScalar(900); sun.target.position.set(0, 0, 0);
  const sc = sun.shadow.camera; sc.left = -S * 1.1; sc.right = S * 1.1; sc.top = S * 1.1; sc.bottom = -S * 1.1; sc.near = 50; sc.far = 2200;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
  const fill = new THREE.DirectionalLight(0x9db4ff, 0.55); fill.position.set(400, 300, 500);
  root.add(hemi, sun, sun.target, fill);

  // —— textures ——
  const texSize = hi() ? 1024 : 512;
  const paving = pavingTextures(texSize);
  const scales = scaleTextures(lo() ? 128 : 256);
  const rock = rockTexture(lo() ? 256 : 512);
  const glow = glowTexture();
  const clouds = cloudTexture(256);
  [paving.map, paving.normalMap, scales.map, scales.normalMap, rock.map, rock.normalMap, glow, clouds].forEach(keep);

  // —— arena: paving + low stone curb ——
  paving.map.repeat.set(W / 160, H / 160); paving.normalMap.repeat.copy(paving.map.repeat);
  const pavMat = keep(new THREE.MeshStandardMaterial({ map: paving.map, normalMap: paving.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.92, metalness: 0 }));
  const arena = new THREE.Mesh(keep(new THREE.PlaneGeometry(W + 60, H + 60)), pavMat);
  arena.rotation.x = -Math.PI / 2; arena.receiveShadow = true;
  // stretch UVs so the paving extends under the curb without seams
  paving.map.repeat.set((W + 60) / 160, (H + 60) / 160); paving.normalMap.repeat.copy(paving.map.repeat);
  root.add(arena);
  const stoneMat = keep(new THREE.MeshStandardMaterial({ map: rock.map, normalMap: rock.normalMap, roughness: 0.95, color: 0xe8dccb }));
  const curbGeo = keep(new THREE.BoxGeometry(1, 1, 1)); curbGeo.translate(0, 0.5, 0);
  const curbs = [];
  const B = 14, CH = 12;
  const addCurbRow = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 42));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, h = CH * (0.75 + R() * 0.5);
      curbs.push({ x: mix(x0, x1, (t0 + t1) / 2), z: mix(z0, z1, (t0 + t1) / 2), w: Math.abs(x1 - x0) > 1 ? len / n - 1.5 : B, d: Math.abs(z1 - z0) > 1 ? len / n - 1.5 : B, h, ry: (R() - 0.5) * 0.04 });
    }
  };
  addCurbRow(-W / 2 - B, -H / 2 - B / 2, W / 2 + B, -H / 2 - B / 2); addCurbRow(-W / 2 - B, H / 2 + B / 2, W / 2 + B, H / 2 + B / 2);
  addCurbRow(-W / 2 - B / 2, -H / 2, -W / 2 - B / 2, H / 2); addCurbRow(W / 2 + B / 2, -H / 2, W / 2 + B / 2, H / 2);
  const curbMesh = new THREE.InstancedMesh(curbGeo, stoneMat, curbs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  curbs.forEach((c, i) => { curbMesh.setMatrixAt(i, m4.compose(v3.set(c.x, -1, c.z), q.setFromAxisAngle(Y, c.ry), s3.set(c.w, c.h, c.d))); });
  curbMesh.castShadow = curbMesh.receiveShadow = true;
  root.add(curbMesh);

  // —— floating island: grassy top + faceted rock underside ——
  const IR = S * 1.25;
  const edgeR = (a) => IR * (0.86 + 0.14 * fbm(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, 3, 2) + 0.05 * Math.sin(a * 7));
  {
    const seg = lo() ? 48 : 96, rings = 10;
    const pos = [], col = [], idx = [];
    for (let r = 0; r <= rings; r++) for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2, t = r / rings, rad = edgeR(a) * t;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const inArena = Math.abs(x) < W / 2 + 30 && Math.abs(z) < H / 2 + 30;
      const n = fbm(x / 90, z / 90, 4, 8);
      pos.push(x, inArena ? -2 : -2 - (t > 0.85 ? (t - 0.85) * 40 : 0) + (n - 0.5) * 6 * t, z);
      const dirt = sat((fbm(x / 50, z / 50, 3, 3) - 0.6) * 3);
      col.push(mix(0.20, 0.42, n) * (1 - dirt) + 0.42 * dirt, mix(0.34, 0.52, n) * (1 - dirt) + 0.33 * dirt, mix(0.12, 0.2, n) * (1 - dirt) + 0.22 * dirt);
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) { const a = r * (seg + 1) + s, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const gg = keep(new THREE.BufferGeometry());
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gg.setIndex(idx); gg.computeVertexNormals();
    const top = new THREE.Mesh(gg, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
    top.receiveShadow = true; root.add(top);
    // underside: tapered rings down to a ragged point
    const levels = lo() ? 6 : 9, useg = lo() ? 28 : 48;
    const p2 = [], c2 = [], i2 = [];
    for (let l = 0; l <= levels; l++) for (let s = 0; s <= useg; s++) {
      const a = (s / useg) * Math.PI * 2, t = l / levels;
      const taper = Math.pow(1 - t, 1.35) * (0.92 + 0.16 * vnoise(s * 0.7, l * 1.3, 4));
      const rad = edgeR(a) * Math.max(0.03, taper);
      const y = -4 - t * IR * 1.15 + (vnoise(s * 1.1, l, 9) - 0.5) * 30;
      p2.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
      const v = 0.55 + vnoise(s * 0.5, l * 0.8, 2) * 0.35, m = l < 2 ? 0.5 : 0;
      c2.push(mix(0.58 * v, 0.25, m), mix(0.48 * v, 0.38, m), mix(0.40 * v, 0.18, m));
    }
    for (let l = 0; l < levels; l++) for (let s = 0; s < useg; s++) { const a = l * (useg + 1) + s, b = a + useg + 1; i2.push(a, a + 1, b, b, a + 1, b + 1); }
    const ug = keep(new THREE.BufferGeometry());
    ug.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3)); ug.setAttribute('color', new THREE.Float32BufferAttribute(c2, 3)); ug.setIndex(i2);
    const ugn = ug.toNonIndexed(); ugn.computeVertexNormals(); keep(ugn);
    const under = new THREE.Mesh(ugn, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));
    root.add(under);
  }

  // —— ruins: fluted columns, an arch, fallen drums, rubble (kept out of the classic view's foreground) ——
  const colGeo = (() => {
    const g = new THREE.CylinderGeometry(1, 1.06, 1, lo() ? 12 : 20, 6); g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); if (r > 0.5) { const a = Math.atan2(z, x), k = 1 - 0.07 * Math.max(0, Math.cos(a * 10)); p.setX(i, x * k); p.setZ(i, z * k); } }
    g.computeVertexNormals(); return keep(g);
  })();
  const ruinMat = keep(new THREE.MeshStandardMaterial({ map: rock.map, normalMap: rock.normalMap, roughness: 0.9, color: 0xf1e2c8 }));
  const ruins = new THREE.Group();
  const leaves = [];
  function column(x, z, h, r = 13, broken = false) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(curbGeo, ruinMat); base.scale.set(r * 2.8, 8, r * 2.8); g.add(base);
    const shaft = new THREE.Mesh(colGeo, ruinMat); shaft.position.y = 8; shaft.scale.set(r, h, r); g.add(shaft);
    if (!broken) { const cap = new THREE.Mesh(curbGeo, ruinMat); cap.position.y = 8 + h; cap.scale.set(r * 2.7, 7, r * 2.7); g.add(cap); }
    else { shaft.rotation.z = (R() - 0.5) * 0.08; }
    g.position.set(x, -2, z); g.rotation.y = R() * Math.PI;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    ruins.add(g);
    // ivy: leaves climbing up one side
    const n = Math.round((lo() ? 14 : 40) * h / 120);
    for (let i = 0; i < n; i++) { const a = R() * Math.PI * 1.2 + 2, yy = 8 + Math.pow(R(), 1.6) * h * 0.9; leaves.push([x + Math.cos(a) * r * 1.02, yy - 2, z + Math.sin(a) * r * 1.02, a]); }
    return g;
  }
  const back = -H / 2 - 70;
  column(-W * 0.42, back - 20, 150); column(-W * 0.14, back - 60, 120, 12, true); column(W * 0.2, back - 40, 170); column(W * 0.48, back - 10, 95, 12, true);
  column(-W / 2 - 75, -H * 0.15, 130); column(-W / 2 - 95, H * 0.25, 60, 12, true);
  column(W / 2 + 80, -H * 0.2, 115, 13, true); column(W / 2 + 70, H * 0.3, 45, 12, true);
  column(-W / 2 - 40, H / 2 + 60, 22, 11, true); column(W / 2 + 50, H / 2 + 70, 30, 11, true);
  // arch behind the arena
  { const ax = 0, az = back - 120, span = 120, h = 140;
    column(ax - span / 2, az, h, 15); column(ax + span / 2, az, h, 15);
    const lintel = new THREE.Mesh(curbGeo, ruinMat); lintel.scale.set(span + 60, 18, 34); lintel.position.set(ax, h + 13, az); lintel.castShadow = true; ruins.add(lintel);
    const top2 = new THREE.Mesh(curbGeo, ruinMat); top2.scale.set(span * 0.6, 12, 28); top2.position.set(ax - 10, h + 31, az); top2.rotation.z = 0.05; ruins.add(top2); }
  // fallen drums + rubble
  for (const [x, z, a] of [[-W / 2 - 60, -H / 2 - 40, 0.6], [W / 2 + 40, -H / 2 - 90, -0.3], [W * 0.1, back - 15, 1.4]]) {
    const d = new THREE.Mesh(colGeo, ruinMat); d.scale.set(12, 42, 12); d.rotation.set(0, a, Math.PI / 2); d.position.set(x, 10, z); d.castShadow = d.receiveShadow = true; ruins.add(d);
  }
  { const rg = keep(new THREE.IcosahedronGeometry(1, 0)); const n = lo() ? 30 : 70; const rub = new THREE.InstancedMesh(rg, keep(new THREE.MeshStandardMaterial({ color: 0xb8a68c, roughness: 1, flatShading: true })), n);
    for (let i = 0; i < n; i++) { let x, z; do { const a = R() * Math.PI * 2, rr = S * (0.58 + R() * 0.55); x = Math.cos(a) * rr; z = Math.sin(a) * rr * 0.9; } while (Math.abs(x) < W / 2 + 20 && Math.abs(z) < H / 2 + 20);
      const s = 3 + R() * 8; rub.setMatrixAt(i, m4.compose(v3.set(x, -1, z), q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)), s3.set(s, s * 0.7, s))); }
    rub.castShadow = rub.receiveShadow = true; ruins.add(rub); }
  // grass tufts
  { const tg = keep(new THREE.ConeGeometry(1, 1, 4)); tg.translate(0, 0.5, 0); const n = lo() ? 120 : 420; const tm = new THREE.InstancedMesh(tg, keep(new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 1 })), n); const cc = new THREE.Color();
    for (let i = 0; i < n; i++) { let x, z; do { const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * IR * 0.95; x = Math.cos(a) * rr; z = Math.sin(a) * rr; } while ((Math.abs(x) < W / 2 + 22 && Math.abs(z) < H / 2 + 22) || Math.hypot(x, z) > edgeR(Math.atan2(z, x)) * 0.95);
      const s = 2 + R() * 3.5; tm.setMatrixAt(i, m4.compose(v3.set(x, -3, z), q.setFromAxisAngle(Y, R() * 6), s3.set(s, s * (2.5 + R() * 3), s))); tm.setColorAt(i, cc.setHSL(0.22 + R() * 0.06, 0.45, 0.28 + R() * 0.14)); }
    ruins.add(tm); }
  // ivy leaves (instanced little diamonds)
  { const lg = keep(new THREE.PlaneGeometry(1, 1)); lg.rotateZ(Math.PI / 4); const lm = new THREE.InstancedMesh(lg, keep(new THREE.MeshStandardMaterial({ color: 0x3f7a2c, roughness: 0.8, side: THREE.DoubleSide })), Math.max(1, leaves.length)); const cc = new THREE.Color();
    leaves.forEach(([x, y, z, a], i) => { const s = 4 + R() * 3; lm.setMatrixAt(i, m4.compose(v3.set(x, y, z), q.setFromEuler(new THREE.Euler(R() - 0.5, -a + Math.PI / 2, R() - 0.5)), s3.set(s, s, s))); lm.setColorAt(i, cc.setHSL(0.26 + R() * 0.07, 0.5, 0.22 + R() * 0.12)); });
    lm.count = leaves.length; ruins.add(lm); }
  root.add(ruins);

  // —— distant world: mountains with snow, smaller floating islands, a sea of clouds ——
  const far = new THREE.Group();
  const mountMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  function mountain(x, z, r, h, seed) {
    const g = new THREE.ConeGeometry(r, h, lo() ? 7 : 11, lo() ? 4 : 7); g.translate(0, h / 2, 0);
    const p = g.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), t = py / h;
      const n = fbm(px / r * 2 + seed, pz / r * 2 + seed, 3, seed);
      if (t < 0.98) { p.setX(i, px * (0.8 + n * 0.45)); p.setZ(i, pz * (0.8 + n * 0.45)); p.setY(i, py + (n - 0.5) * h * 0.12); }
      const snow = t > 0.68 + n * 0.1 ? 1 : 0;
      col.push(snow ? 0.95 : mix(0.30, 0.46, n), snow ? 0.93 : mix(0.30, 0.40, n), snow ? 1.0 : mix(0.42, 0.52, n));
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const gn = g.toNonIndexed(); gn.computeVertexNormals(); keep(g); keep(gn);
    const m = new THREE.Mesh(gn, mountMat); m.position.set(x, -760, z); far.add(m);
  }
  const MR = rng(99);
  for (let i = 0; i < (lo() ? 9 : 15); i++) {
    const a = -Math.PI * 0.95 + (i / (lo() ? 8 : 14)) * Math.PI * 1.9 + (MR() - 0.5) * 0.2 - Math.PI / 2;
    const d = 2300 + MR() * 1100;
    mountain(Math.cos(a) * d, Math.sin(a) * d, 420 + MR() * 420, 1050 + MR() * 900, i * 7 + 1);
  }
  function islet(x, y, z, r) {
    const g = keep(new THREE.ConeGeometry(r, r * 1.6, 9, 3)); g.rotateX(Math.PI); g.translate(0, -r * 0.8, 0);
    const m = new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ color: 0x8c7a66, roughness: 1, flatShading: true })));
    const t = new THREE.Mesh(keep(new THREE.CylinderGeometry(r * 1.02, r * 0.98, r * 0.12, 9)), keep(new THREE.MeshStandardMaterial({ color: 0x55803c, roughness: 1, flatShading: true })));
    const gr = new THREE.Group(); gr.add(m, t); gr.position.set(x, y, z); far.add(gr); return gr;
  }
  const islets = [islet(-1250, 140, -1500, 150), islet(1400, -60, -1150, 110), islet(-1800, -220, 300, 120), islet(900, 260, -2100, 180)];
  const cloudSea = new THREE.Mesh(keep(new THREE.PlaneGeometry(12000, 12000)), keep(new THREE.MeshBasicMaterial({ map: clouds, transparent: true, opacity: 0.85, depthWrite: false, color: 0xffd6bc })));
  clouds.repeat.set(9, 9); cloudSea.rotation.x = -Math.PI / 2; cloudSea.position.y = -620; far.add(cloudSea);
  root.add(far);

  // —— waterfalls (scrolling shader sheets) + mist ——
  const falls = [];
  function waterfall(x, y, z, w, h, seed) {
    const mat = keep(new THREE.ShaderMaterial({ vertexShader: FALL_VS, fragmentShader: FALL_FS, uniforms: { uT: { value: 0 }, uSeed: { value: seed } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h, 1, 1)), mat);
    m.geometry.translate(0, -h / 2, 0);
    m.position.set(x, y, z); m.lookAt(0, y, 0);
    root.add(m); falls.push({ mat, x, y, z, w, h });
    return m;
  }
  // one off our own island edge (back-left) and wide ones far away
  const ea = -2.25, er = edgeR(ea) * 0.98;
  waterfall(Math.cos(ea) * er, -3, Math.sin(ea) * er, 46, 820, 1.3);
  waterfall(-1250, 125, -1500 + 140, 70, 900, 3.1);
  waterfall(900, 250, -2100 + 170, 110, 1100, 5.7);
  waterfall(1400, -70, -1150 + 100, 50, 700, 8.2);
  // little stream channel from the arena edge to the fall
  { const sx = Math.cos(ea) * er, sz = Math.sin(ea) * er; const len = Math.hypot(sx - (-W / 2 - 20), sz - (-H / 2 - 20));
    const st = new THREE.Mesh(keep(new THREE.PlaneGeometry(22, len)), keep(new THREE.MeshStandardMaterial({ color: 0x6fa8c8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 })));
    st.rotation.x = -Math.PI / 2; st.position.set((sx - W / 2 - 20) / 2, -1.2, (sz - H / 2 - 20) / 2); st.rotation.z = -Math.atan2(sz - (-H / 2 - 20), sx - (-W / 2 - 20)) + Math.PI / 2; root.add(st); }

  const MN = 420;
  const mist = { pos: new Float32Array(MN * 3), vel: new Float32Array(MN * 3), life: new Float32Array(MN), max: new Float32Array(MN), size: new Float32Array(MN), alpha: new Float32Array(MN), src: new Uint8Array(MN) };
  const mistGeo = keep(new THREE.BufferGeometry());
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mist.pos, 3).setUsage(THREE.DynamicDrawUsage));
  mistGeo.setAttribute('size', new THREE.BufferAttribute(mist.size, 1).setUsage(THREE.DynamicDrawUsage));
  mistGeo.setAttribute('alpha', new THREE.BufferAttribute(mist.alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mistMat = keep(new THREE.ShaderMaterial({ vertexShader: MIST_VS, fragmentShader: MIST_FS, uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color(0xfff1e6) } }, transparent: true, depthWrite: false }));
  const mistPts = new THREE.Points(mistGeo, mistMat); mistPts.frustumCulled = false; root.add(mistPts);
  const mistCount = () => (hi() ? MN : tier === 'mid' ? 220 : 90);
  function respawnMist(k) {
    const f = falls[k % falls.length], top = R() < 0.3;
    const yy = top ? f.y - 10 : f.y - f.h * (0.55 + R() * 0.45);
    mist.pos[k * 3] = f.x + (R() - 0.5) * f.w * 1.2; mist.pos[k * 3 + 1] = yy; mist.pos[k * 3 + 2] = f.z + (R() - 0.5) * f.w * 0.6;
    mist.vel[k * 3] = (R() - 0.5) * 20; mist.vel[k * 3 + 1] = 6 + R() * 18; mist.vel[k * 3 + 2] = (R() - 0.5) * 20;
    mist.max[k] = mist.life[k] = 2.5 + R() * 3.5; mist.size[k] = f.w * (0.9 + R() * 1.4);
  }
  for (let k = 0; k < MN; k++) { respawnMist(k); mist.life[k] *= R(); }

  // —— sunset motes drifting through the light ——
  const DN = 160;
  const dust = new Float32Array(DN * 3), dustA = new Float32Array(DN), dustS = new Float32Array(DN);
  for (let i = 0; i < DN; i++) { dust[i * 3] = (R() - 0.5) * S * 2.2; dust[i * 3 + 1] = 10 + R() * 160; dust[i * 3 + 2] = (R() - 0.5) * S * 2.2; dustS[i] = 1.5 + R() * 2.5; dustA[i] = 0.4 + R() * 0.5; }
  const dGeo = keep(new THREE.BufferGeometry());
  dGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3).setUsage(THREE.DynamicDrawUsage)); dGeo.setAttribute('size', new THREE.BufferAttribute(dustS, 1)); dGeo.setAttribute('alpha', new THREE.BufferAttribute(dustA, 1));
  const dMat = keep(new THREE.ShaderMaterial({ vertexShader: MIST_VS, fragmentShader: MIST_FS, uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color(0xffd79a) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const dPts = new THREE.Points(dGeo, dMat); dPts.frustumCulled = false; root.add(dPts);

  // —— god rays: long additive cards from the sun, billboarded around their own axis ——
  const rayTex = (() => { const [c, g] = canvas2d(64, 256); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    const id = g.getImageData(0, 0, 64, 256); for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) { const e = Math.sin(Math.PI * x / 63); id.data[(y * 64 + x) * 4 + 3] *= e * e; } g.putImageData(id, 0, 0); return keep(new THREE.CanvasTexture(c)); })();
  const rays = [];
  const rayN = lo() ? 4 : 7;
  for (let i = 0; i < rayN; i++) {
    const mat = keep(new THREE.MeshBasicMaterial({ map: rayTex, color: 0xffc890, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const len = 1700 + R() * 900, wdt = 90 + R() * 170;
    const g = keep(new THREE.PlaneGeometry(wdt, len)); g.translate(0, -len / 2, 0); // hangs from its top (towards the sun)
    const m = new THREE.Mesh(g, mat);
    const startP = sunDir.clone().multiplyScalar(1500).add(new THREE.Vector3((R() - 0.5) * 900, (R() - 0.3) * 300, (R() - 0.5) * 500));
    const endP = new THREE.Vector3((R() - 0.5) * S * 1.6, -40, (R() - 0.5) * S * 1.4);
    rays.push({ m, start: startP, axis: endP.clone().sub(startP).normalize(), base: 0.028 + R() * 0.04, ph: R() * 6 });
    m.position.copy(startP); root.add(m);
  }

  // —— low drifting fog banks around the island rim ——
  const banks = [];
  for (let i = 0; i < (lo() ? 5 : 11); i++) {
    const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: clouds, color: 0xffe0cc, transparent: true, opacity: 0.2, depthWrite: false, fog: true })));
    const a = R() * Math.PI * 2, rr = IR * (0.95 + R() * 0.6);
    sp.position.set(Math.cos(a) * rr, -30 - R() * 80, Math.sin(a) * rr); const s = 260 + R() * 260; sp.scale.set(s, s * 0.4, 1);
    sp.userData = { a, rr, sp: (R() - 0.5) * 0.02 };
    root.add(sp); banks.push(sp);
  }

  // —— the snake: a tapered scaly tube rebuilt every frame + a modelled head ——
  const MAXR = 16 * 16 * 4 + 8, RAD = lo() ? 8 : 12;
  const tPos = new Float32Array(MAXR * (RAD + 1) * 3), tNor = new Float32Array(MAXR * (RAD + 1) * 3), tUv = new Float32Array(MAXR * (RAD + 1) * 2);
  const tIdx = new Uint32Array((MAXR - 1) * RAD * 6);
  { let o = 0; for (let r = 0; r < MAXR - 1; r++) for (let s = 0; s < RAD; s++) { const a = r * (RAD + 1) + s, b = a + RAD + 1; tIdx[o++] = a; tIdx[o++] = b; tIdx[o++] = a + 1; tIdx[o++] = b; tIdx[o++] = b + 1; tIdx[o++] = a + 1; } }
  const tGeo = keep(new THREE.BufferGeometry());
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute('normal', new THREE.BufferAttribute(tNor, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute('uv', new THREE.BufferAttribute(tUv, 2).setUsage(THREE.DynamicDrawUsage));
  tGeo.setIndex(new THREE.BufferAttribute(tIdx, 1));
  const skinMat = keep(new THREE.MeshStandardMaterial({ map: scales.map, normalMap: scales.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.38, metalness: 0.08 }));
  const body = new THREE.Mesh(tGeo, skinMat); body.frustumCulled = false; body.castShadow = true; body.receiveShadow = true;
  root.add(body);
  const head = new THREE.Group();
  const C0 = 20;
  { const hg = keep(new THREE.SphereGeometry(1, lo() ? 14 : 24, lo() ? 10 : 16));
    const p = hg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x > 0) { p.setY(i, p.getY(i) * (1 - x * 0.35)); p.setZ(i, p.getZ(i) * (1 - x * 0.25)); } } hg.computeVertexNormals();
    const skull = new THREE.Mesh(hg, skinMat); skull.scale.set(C0 * 0.62, C0 * 0.36, C0 * 0.48); skull.castShadow = true; head.add(skull);
    const eyeM = keep(new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x6a4a00, roughness: 0.15 }));
    const pupM = keep(new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 }));
    const eg = keep(new THREE.SphereGeometry(1, 12, 8));
    for (const sgn of [-1, 1]) { const e = new THREE.Mesh(eg, eyeM); e.scale.setScalar(C0 * 0.12); e.position.set(C0 * 0.18, C0 * 0.2, sgn * C0 * 0.3); head.add(e);
      const pu = new THREE.Mesh(eg, pupM); pu.scale.set(C0 * 0.03, C0 * 0.1, C0 * 0.04); pu.position.set(C0 * 0.27, C0 * 0.22, sgn * C0 * 0.37); head.add(pu); }
    const tongueM = keep(new THREE.MeshStandardMaterial({ color: 0xc0203a, roughness: 0.5 }));
    const tongue = new THREE.Group(); tongue.name = 'tongue';
    const tb = keep(new THREE.BoxGeometry(1, 1, 1)); const t1 = new THREE.Mesh(tb, tongueM); t1.scale.set(C0 * 0.5, 1, 1.2); t1.position.x = C0 * 0.25; tongue.add(t1);
    for (const sgn of [-1, 1]) { const f = new THREE.Mesh(tb, tongueM); f.scale.set(C0 * 0.16, 0.8, 0.9); f.position.set(C0 * 0.56, 0, sgn * 1.6); f.rotation.y = -sgn * 0.5; tongue.add(f); }
    tongue.position.set(C0 * 0.5, -C0 * 0.04, 0); head.add(tongue);
  }
  root.add(head);
  const tongue = head.getObjectByName('tongue');

  // —— apple: glossy lathe body, stem, leaf, glow halo + light ——
  const apple = new THREE.Group();
  { const prof = []; for (let i = 0; i <= 20; i++) { const t = i / 20, a = t * Math.PI; let r = Math.sin(a) * (1 + 0.12 * Math.sin(a * 2)); let y = -Math.cos(a) * 0.92; if (t < 0.12) r *= t / 0.12 * 0.9; if (t > 0.88) { r *= (1 - t) / 0.12 * 0.85 + 0.15; y -= (t - 0.88) * 0.8; } prof.push(new THREE.Vector2(Math.max(0.001, r), y)); }
    const ag = keep(new THREE.LatheGeometry(prof, lo() ? 16 : 28));
    const am = keep(new THREE.MeshPhysicalMaterial({ color: 0xc4142c, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x500812, emissiveIntensity: 0.8 }));
    const body2 = new THREE.Mesh(ag, am); body2.scale.setScalar(C0 * 0.4); body2.castShadow = true; apple.add(body2);
    const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.6, 0.9, C0 * 0.3, 6)), keep(new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.9 })));
    stem.position.y = C0 * 0.42; stem.rotation.z = 0.25; apple.add(stem);
    const lshape = new THREE.Shape(); lshape.moveTo(0, 0); lshape.quadraticCurveTo(3, 3, 8, 0.5); lshape.quadraticCurveTo(3, -2, 0, 0);
    const leaf = new THREE.Mesh(keep(new THREE.ShapeGeometry(lshape)), keep(new THREE.MeshStandardMaterial({ color: 0x4f9a2e, roughness: 0.6, side: THREE.DoubleSide })));
    leaf.position.set(1, C0 * 0.5, 0); leaf.rotation.set(-0.6, 0.4, 0.3); apple.add(leaf);
    const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: 0xff5a3a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
    halo.scale.setScalar(C0 * 2.6); halo.name = 'halo'; apple.add(halo);
  }
  const appleLight = new THREE.PointLight(0xff4a30, 0, 140, 1.8); apple.add(appleLight);
  root.add(apple);
  const halo = apple.getObjectByName('halo');

  // —— tier handling ——
  function applyTier() {
    sun.castShadow = hi();
    appleLight.intensity = lo() ? 0 : 900;
    [pavMat, stoneMat, ruinMat, skinMat].forEach((m) => { m.needsUpdate = true; });
  }
  applyTier();

  // —— per-frame ——
  const P = [], tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), camV = new THREE.Vector3(), nrm = new THREE.Vector3(), xb = new THREE.Vector3(), mat3 = new THREE.Matrix4();
  let headYaw = 0, tongueT = 0, lastLen = 0;
  const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  function buildSnake(st, dt) {
    const { snake, dir, frac, CELL } = st;
    const n = snake.length;
    const cx = (p) => (p.x + 0.5) * CELL - W / 2, cz = (p) => (p.y + 0.5) * CELL - H / 2;
    // interpolated spine: each segment slides toward the one in front of it
    P.length = 0;
    for (let i = 0; i < n; i++) {
      const p = snake[i];
      let tx, tz;
      if (i === 0) { tx = cx(p) + dir.x * CELL * frac; tz = cz(p) + dir.y * CELL * frac; }
      else { const a = snake[i - 1]; tx = mix(cx(p), cx(a), frac); tz = mix(cz(p), cz(a), frac); }
      P.push([tx, tz]);
    }
    if (n === 1) P.push([P[0][0] - dir.x * CELL, P[0][1] - dir.y * CELL]);
    // resample with a centripetal Catmull-Rom for smooth bends
    const curve = new THREE.CatmullRomCurve3(P.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const L = Math.max(1, curve.getLength());
    const rings = Math.min(MAXR, Math.max(8, Math.round(L / 2.6)));
    const pts = curve.getSpacedPoints(rings - 1);
    const rMax = CELL * 0.36;
    let o = 0, ou = 0;
    for (let r = 0; r < rings; r++) {
      const t = r / (rings - 1);
      const p = pts[r], q2 = pts[Math.min(rings - 1, r + 1)], q0 = pts[Math.max(0, r - 1)];
      tmpA.subVectors(q0, q2); tmpA.y = 0; if (tmpA.lengthSq() < 1e-6) tmpA.set(-dir.x, 0, -dir.y); tmpA.normalize(); // points toward the head
      xb.set(-tmpA.z, 0, tmpA.x); // side
      const neck = t < 0.06 ? 0.78 + t / 0.06 * 0.22 : 1;
      const taper = t > 0.55 ? Math.pow(1 - (t - 0.55) / 0.45, 0.8) * 0.88 + 0.12 : 1;
      const rad = rMax * neck * taper * (1 + 0.04 * Math.sin(t * 40));
      const yc = rad * 0.82;
      for (let s = 0; s <= RAD; s++) {
        const a = (s / RAD) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        tPos[o] = p.x + xb.x * ca * rad; tPos[o + 1] = yc + sa * rad * 0.82; tPos[o + 2] = p.z + xb.z * ca * rad;
        nrm.set(xb.x * ca, sa, xb.z * ca).normalize();
        tNor[o] = nrm.x; tNor[o + 1] = nrm.y; tNor[o + 2] = nrm.z; o += 3;
        tUv[ou++] = (t * L) / (CELL * 1.1); tUv[ou++] = s / RAD; // v=0.75 (sin=-1) is the belly
      }
    }
    tGeo.setDrawRange(0, (rings - 1) * RAD * 6);
    tGeo.attributes.position.needsUpdate = tGeo.attributes.normal.needsUpdate = tGeo.attributes.uv.needsUpdate = true;
    tGeo.computeBoundingSphere();
    // head follows the first spine samples
    const hp = pts[0], hn = pts[Math.min(3, rings - 1)];
    const want = Math.atan2(hp.z - hn.z, hp.x - hn.x);
    headYaw = lerpAng(headYaw, want, 1 - Math.exp(-dt * 18));
    head.position.set(hp.x, rMax * 0.78, hp.z);
    head.rotation.set(0, -headYaw, 0);
    head.scale.setScalar(CELL / 20);
    lastLen = n;
  }

  function update(dt, now, camera) {
    const t = now / 1000;
    const st = getState?.();
    if (st && st.snake?.length) {
      body.visible = head.visible = true;
      buildSnake(st, dt);
      // tongue flick every ~2.5 s
      tongueT -= dt; if (tongueT < -2.2) tongueT = 0.35;
      tongue.scale.x = tongueT > 0 ? 0.4 + Math.sin((tongueT / 0.35) * Math.PI) * 0.9 : 0.01;
      skinMat.color.setScalar(st.over ? 0.55 : 1);
      if (st.food) {
        const fx = (st.food.x + 0.5) * st.CELL - W / 2, fz = (st.food.y + 0.5) * st.CELL - H / 2;
        apple.visible = true;
        apple.position.set(fx, st.CELL * 0.42 + Math.sin(t * 2.4) * 2.2, fz);
        apple.rotation.y = t * 0.8;
        halo.material.opacity = 0.5 + Math.sin(t * 3.1) * 0.15;
        apple.scale.setScalar(st.CELL / 20);
      }
    } else { body.visible = head.visible = false; apple.visible = false; }
    for (const f of falls) f.mat.uniforms.uT.value = t;
    // mist
    const mc = mistCount();
    for (let k = 0; k < MN; k++) {
      if (k >= mc) { mist.alpha[k] = 0; continue; }
      mist.life[k] -= dt;
      if (mist.life[k] <= 0) respawnMist(k);
      mist.pos[k * 3] += mist.vel[k * 3] * dt; mist.pos[k * 3 + 1] += mist.vel[k * 3 + 1] * dt; mist.pos[k * 3 + 2] += mist.vel[k * 3 + 2] * dt;
      const lf = mist.life[k] / mist.max[k];
      mist.alpha[k] = Math.sin(lf * Math.PI) * 0.22;
    }
    mistGeo.attributes.position.needsUpdate = mistGeo.attributes.alpha.needsUpdate = mistGeo.attributes.size.needsUpdate = true;
    const h = renderer.domElement.height || 600;
    mistMat.uniforms.uScale.value = h * 1.1; dMat.uniforms.uScale.value = h * 1.1;
    // motes
    for (let i = 0; i < DN; i++) { dust[i * 3] += Math.sin(t * 0.3 + i) * dt * 4; dust[i * 3 + 1] += Math.sin(t * 0.7 + i * 1.7) * dt * 3; dust[i * 3 + 2] += Math.cos(t * 0.25 + i) * dt * 4; }
    dGeo.attributes.position.needsUpdate = true;
    // god rays: spin each card around its axis to face the camera
    camV.copy(camera.position);
    for (const r of rays) {
      const toC = tmpA.subVectors(camV, r.start);
      const along = r.axis.dot(toC);
      nrm.copy(toC).addScaledVector(r.axis, -along).normalize();
      xb.crossVectors(nrm, r.axis).normalize();
      tmpB.copy(r.axis).negate(); // local +Y points back toward the sun (card hangs from its top)
      mat3.makeBasis(xb, tmpB, nrm);
      r.m.quaternion.setFromRotationMatrix(mat3);
      r.m.material.opacity = r.base * (0.75 + 0.25 * Math.sin(t * 0.4 + r.ph));
    }
    for (const b of banks) { b.userData.a += b.userData.sp * dt; b.position.x = Math.cos(b.userData.a) * b.userData.rr; b.position.z = Math.sin(b.userData.a) * b.userData.rr; }
    islets.forEach((g, i) => { g.position.y += Math.sin(t * 0.3 + i * 2) * dt * 3; });
    clouds.offset.x = t * 0.002; clouds.offset.y = t * 0.001;
  }

  return {
    update,
    setTier(t) { tier = t; applyTier(); },
    info: () => ({ mist: mistCount(), rays: rayN, tex: texSize }),
    dispose() {
      scene.remove(root);
      scene.fog = prevFog;
      disposables.forEach((d) => d.dispose?.());
    },
  };
}
