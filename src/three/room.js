// The 3D arcade room behind the menu: 12 cabinets in an arc, neon, floor reflections, dust, a drifting camera
// that leans toward the cart you point at and flies into its screen when you pick it.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { getTier, onTier, makeWatchdog, pixelRatio } from './quality.js';

const FONT = '"Press Start 2P", monospace';
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createRoom(games) {
  const canvas = document.createElement('canvas');
  canvas.id = 'room3d';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: getTier() === 'high', powerPreference: 'high-performance' });
  } catch (e) { return null; }
  document.body.prepend(canvas);
  renderer.setClearColor(0x07050d, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0614, 0.055);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);

  scene.add(new THREE.AmbientLight(0x6a5a8a, 0.9));
  const pinkL = new THREE.PointLight(0xff3fa4, 60, 30, 1.5); pinkL.position.set(-6, 4.2, -4); scene.add(pinkL);
  const cyanL = new THREE.PointLight(0x2de2ff, 60, 30, 1.5); cyanL.position.set(6, 4.2, -4); scene.add(cyanL);
  const focusL = new THREE.PointLight(0xffffff, 0, 6, 1.5); scene.add(focusL);

  // —— floor (mirror on high quality) ——
  let mirror = null;
  const floorTop = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x120c1c, roughness: 0.35, metalness: 0.4, transparent: true, opacity: 0.86 }));
  floorTop.rotation.x = -Math.PI / 2; floorTop.position.y = 0.002;
  scene.add(floorTop);
  // checker carpet lines
  const grid = new THREE.GridHelper(80, 80, 0x3a2160, 0x24163d);
  grid.position.y = 0.004; grid.material.transparent = true; grid.material.opacity = 0.55;
  scene.add(grid);
  function setupMirror() {
    if (getTier() === 'high' && !mirror) {
      mirror = new Reflector(new THREE.PlaneGeometry(80, 80), { textureWidth: Math.min(1024, innerWidth), textureHeight: Math.min(1024, innerHeight), color: 0x8a8a9a });
      mirror.rotation.x = -Math.PI / 2;
      scene.add(mirror);
      floorTop.material.opacity = 0.8;
    } else if (getTier() !== 'high' && mirror) {
      scene.remove(mirror); mirror.dispose?.(); mirror = null;
      floorTop.material.opacity = 1;
    }
    floorTop.material.transparent = !!mirror;
    floorTop.material.needsUpdate = true;
  }

  // —— walls, ceiling neon ——
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x150f22, roughness: 0.9 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(60, 12), wallMat);
  back.position.set(0, 6, -16); scene.add(back);
  const neonCols = [0xff3fa4, 0x2de2ff, 0xffe066, 0x55efc4];
  for (let i = 0; i < 4; i++) {
    const tube = new THREE.Mesh(new THREE.BoxGeometry(30, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: neonCols[i] }));
    tube.position.set(0, 5.2, -2 - i * 3.6); scene.add(tube);
  }
  // sign
  const signCv = document.createElement('canvas'); signCv.width = 1024; signCv.height = 192;
  const signTex = new THREE.CanvasTexture(signCv); signTex.colorSpace = THREE.SRGBColorSpace;
  const drawSign = () => {
    const g = signCv.getContext('2d');
    g.clearRect(0, 0, 1024, 192);
    g.font = `84px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#33ff66'; g.shadowBlur = 30; g.fillStyle = '#b6ffc8';
    g.fillText('PIXEL NOOK', 512, 100); g.shadowBlur = 0; g.fillText('PIXEL NOOK', 512, 100);
    signTex.needsUpdate = true;
  };
  drawSign();
  document.fonts?.ready?.then(drawSign);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthWrite: false }));
  sign.position.set(0, 7.4, -15.9); scene.add(sign);

  // —— cabinets ——
  const ids = Object.keys(games);
  const R = 9.5, arc = THREE.MathUtils.degToRad(150);
  const cabs = {};
  const bodyGeo = new THREE.BoxGeometry(1.25, 2.3, 1.1);
  const panelGeo = new THREE.BoxGeometry(1.25, 0.14, 0.6);
  const marqGeo = new THREE.BoxGeometry(1.27, 0.34, 0.5);
  const screenGeo = new THREE.PlaneGeometry(0.98, 0.78);
  const btnGeo = new THREE.SphereGeometry(0.05, 10, 8);
  const stripGeo = new THREE.BoxGeometry(0.04, 2.2, 1.12);
  ids.forEach((id, i) => {
    const g = games[id];
    const th = -arc / 2 + arc * (i / (ids.length - 1));
    const grp = new THREE.Group();
    grp.position.set(Math.sin(th) * R, 0, -Math.cos(th) * R + 1.5);
    grp.lookAt(0, 0, 1.5);
    const col = new THREE.Color(g.color);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.35), roughness: 0.6, metalness: 0.2 }));
    body.position.y = 1.15; grp.add(body);
    const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(g.accent) });
    for (const sx of [-0.64, 0.64]) { const st = new THREE.Mesh(stripGeo, sm); st.position.set(sx, 1.15, 0); grp.add(st); }
    const marq = new THREE.Mesh(marqGeo, new THREE.MeshBasicMaterial({ color: col }));
    marq.position.set(0, 2.15, 0.33); grp.add(marq);
    const panel = new THREE.Mesh(panelGeo, new THREE.MeshStandardMaterial({ color: 0x1b1626, roughness: 0.5 }));
    panel.position.set(0, 1.02, 0.7); panel.rotation.x = 0.25; grp.add(panel);
    [[-0.3, '#ff4d6d'], [0.12, '#ffe066'], [0.3, '#2de2ff']].forEach(([x, c]) => {
      const b = new THREE.Mesh(btnGeo, new THREE.MeshBasicMaterial({ color: c })); b.position.set(x, 1.13, 0.72); grp.add(b);
    });
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const scr = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ map: tex }));
    scr.position.set(0, 1.62, 0.556); grp.add(scr);
    scene.add(grp);
    cabs[id] = { grp, cv, tex, scr, g, th, seed: i * 17 };
  });
  function drawScreen(c, t) {
    const x = c.cv.getContext('2d');
    x.fillStyle = '#05060a'; x.fillRect(0, 0, 128, 96);
    x.fillStyle = c.g.accent;
    const s = c.seed;
    for (let k = 0; k < 14; k++) {
      const px = ((k * 37 + s * 13 + t * (20 + (k % 5) * 9)) % 140) - 6;
      const py = 16 + ((k * 23 + s * 7) % 60);
      x.fillRect(Math.floor(px), py, 4 + (k % 3) * 2, 4);
    }
    x.fillStyle = c.g.color; x.fillRect(Math.floor(54 + Math.sin(t * 1.7 + s) * 40), 82, 18, 6);
    x.font = `8px ${FONT}`; x.textAlign = 'center'; x.fillStyle = '#fff';
    x.fillText(c.g.title.toUpperCase(), 64, 11);
    if ((t + c.seed * 0.13) % 2.4 < 1.7) { x.fillStyle = '#ffe066'; x.fillText('INSERT COIN', 64, 52); }
    x.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 96; y += 2) x.fillRect(0, y, 128, 1);
    c.tex.needsUpdate = true;
  }

  // —— dust ——
  const DN = 260;
  const dPos = new Float32Array(DN * 3);
  for (let i = 0; i < DN; i++) { dPos[i * 3] = (Math.random() - 0.5) * 24; dPos[i * 3 + 1] = Math.random() * 5.5; dPos[i * 3 + 2] = -Math.random() * 16 + 3; }
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0xc8b8ff, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // —— post ——
  let composer = null, bloom = null;
  function setupTier() {
    renderer.setPixelRatio(pixelRatio());
    setupMirror();
    composer?.dispose?.(); composer = null; bloom = null;
    if (getTier() !== 'low') {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), getTier() === 'high' ? 1.05 : 0.85, 0.6, 0.35);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }
    resize(true);
  }
  let vw = 0, vh = 0;
  function resize(force) {
    const w = innerWidth, h = innerHeight;
    if (!force && w === vw && h === vh) return;
    vw = w; vh = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(pixelRatio()); composer.setSize(w, h); bloom?.resolution.set(w * 0.4, h * 0.4); }
  }

  // —— camera ——
  const restPos = new THREE.Vector3(0, 1.9, 4.6), restLook = new THREE.Vector3(0, 1.5, -6);
  const camPos = restPos.clone(), camLook = restLook.clone();
  const tgtPos = new THREE.Vector3(), tgtLook = new THREE.Vector3();
  let focusId = null, fly = null, running = false, raf = 0, t0 = performance.now(), screenIdx = 0;
  const watchdog = makeWatchdog();
  const offTier = onTier(setupTier);

  function screenPose(id, dist, outPos, outLook) {
    const c = cabs[id];
    c.scr.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(); c.scr.getWorldPosition(p);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(c.grp.quaternion);
    outLook.copy(p);
    outPos.copy(p).addScaledVector(n, dist);
  }

  let last = 0, skipOdd = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (getTier() === 'low' && (skipOdd = !skipOdd)) return; // ~30 fps on weak devices
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    watchdog(now);
    resize(false);
    const t = (now - t0) / 1000;
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.dur);
      const k = ease(fly.t);
      camPos.lerpVectors(fly.p0, fly.p1, k); camLook.lerpVectors(fly.l0, fly.l1, k);
      if (fly.t >= 1) { const f = fly; fly = null; f.done?.(); }
    } else {
      tgtPos.copy(restPos); tgtLook.copy(restLook);
      tgtPos.x += Math.sin(t * 0.21) * 0.6; tgtPos.y += Math.sin(t * 0.33) * 0.12;
      if (focusId && cabs[focusId]) {
        const c = cabs[focusId];
        const p = new THREE.Vector3(); c.grp.getWorldPosition(p);
        tgtLook.lerp(p.setY(1.5), 0.55);
        tgtPos.x += Math.sin(c.th) * 1.2;
        tgtPos.z -= 0.6;
      }
      const k = 1 - Math.exp(-dt * 2.4);
      camPos.lerp(tgtPos, k); camLook.lerp(tgtLook, k);
    }
    camera.position.copy(camPos); camera.lookAt(camLook);
    // focus light + attract screens (a few per frame)
    if (focusId && cabs[focusId]) { const p = new THREE.Vector3(); cabs[focusId].scr.getWorldPosition(p); focusL.position.copy(p).add(new THREE.Vector3(0, 0.6, 0)); focusL.color.set(cabs[focusId].g.accent); focusL.intensity += (8 - focusL.intensity) * 0.1; }
    else focusL.intensity *= 0.9;
    const per = getTier() === 'low' ? 1 : 3;
    for (let k = 0; k < per; k++) { drawScreen(cabs[ids[screenIdx]], t); screenIdx = (screenIdx + 1) % ids.length; }
    if (focusId && cabs[focusId]) drawScreen(cabs[focusId], t);
    pinkL.intensity = 55 + Math.sin(t * 3.1) * 8; cyanL.intensity = 55 + Math.cos(t * 2.7) * 8;
    for (let i = 0; i < DN; i++) { dPos[i * 3 + 1] += 0.06 * dt; if (dPos[i * 3 + 1] > 5.5) dPos[i * 3 + 1] = 0; dPos[i * 3] += Math.sin(t + i) * 0.02 * dt; }
    dGeo.attributes.position.needsUpdate = true;
    if (composer) composer.render(dt); else renderer.render(scene, camera);
  }

  setupTier();
  ids.forEach((id) => drawScreen(cabs[id], 0));

  return {
    start() { if (running) return; running = true; canvas.style.display = ''; last = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); canvas.style.display = 'none'; },
    focus(id) { focusId = id; },
    /** Fly into a cabinet's screen; resolves when the camera arrives. */
    flyTo(id, dur = 0.6) {
      if (!cabs[id]) return Promise.resolve();
      const p1 = new THREE.Vector3(), l1 = new THREE.Vector3();
      screenPose(id, 0.42, p1, l1);
      return new Promise((done) => { fly = { t: 0, dur, p0: camPos.clone(), l0: camLook.clone(), p1, l1, done }; });
    },
    /** Start inside a cabinet's screen and pull back to the room. */
    pullBack(id, dur = 0.9) {
      if (!cabs[id]) return;
      const p0 = new THREE.Vector3(), l0 = new THREE.Vector3();
      screenPose(id, 0.42, p0, l0);
      camPos.copy(p0); camLook.copy(l0);
      fly = { t: 0, dur, p0, l0, p1: restPos.clone(), l1: restLook.clone() };
    },
    get running() { return running; },
    dispose() { offTier(); cancelAnimationFrame(raf); composer?.dispose?.(); renderer.dispose(); canvas.remove(); },
  };
}
