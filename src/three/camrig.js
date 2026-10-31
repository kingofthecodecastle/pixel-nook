// Camera rigs for the 3D cart view: CLASSIC (tilted board view), CHASE (low, close, behind the player)
// and FIRST PERSON (eye level from the player). Targets are smoothed so turns never snap the view.
import * as THREE from 'three';

export const CAM_MODES = ['arcade', 'classic', 'chase', 'fp'];
export const CAM_LABEL = { classic: 'CLASSIC', chase: 'CHASE', fp: 'FIRST PERSON', arcade: 'ARCADE' };

// u = size of "one body" in board pixels; low = a dramatic low-angle variant for carts without a real heading
const RIG = {
  snake: { u: 20 }, mazemunch: { u: 16, fpFwd: 0.55, fpEye: 0.62, chUp: 3.4, chBack: 3.4 }, blockdrop: { u: 18, well: true },
  starblaster: { u: 22 }, brickbash: { u: 24, low: true }, froghop: { u: 28 },
  asteroiddrift: { u: 20 }, pixelpaddle: { u: 22, low: true }, ladderclimb: { u: 16, follow: true },
  neonracer: { u: 26 }, moondrop: { u: 22, lander: true }, tankduel: { u: 26 },
};
export const FOV = { classic: 30, chase: 58, fp: 72, arcade: 30 };

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function makeRig(gameId, W, H) {
  const r = RIG[gameId] || { u: 22 };
  const U = r.u;
  const A = new THREE.Vector3();
  let has = false, yaw = -Math.PI / 2, lastAv = null, lastT = 0;
  const f = new THREE.Vector3();

  /** Writes the wanted camera pose for `mode` into pos/look/up. Returns false when there is no avatar to follow. */
  function target(mode, av, dt, now, pos, look, up) {
    if (av) { lastAv = av; lastT = now; }
    else if (lastAv && now - lastT < 2500) av = lastAv; // brief gaps (respawn, round reset) keep the last spot
    if (!av || !Number.isFinite(av.x) || !Number.isFinite(av.y)) return false;
    const ax = av.x - W / 2, az = av.y - H / 2;
    // follow the avatar: cut on teleports (screen wrap, restart), otherwise glide
    if (!has || Math.hypot(ax - A.x, az - A.z) > U * 6) { A.set(ax, 0, az); yaw = Number.isFinite(av.h) ? av.h : yaw; has = true; }
    else { const k = 1 - Math.exp(-dt * 10); A.x += (ax - A.x) * k; A.z += (az - A.z) * k; }
    if (Number.isFinite(av.h)) {
      const d = wrap(av.h - yaw);
      let step = d * (1 - Math.exp(-dt * 5));
      const cap = 3.2 * dt; // rad/s ceiling keeps quick 90° snake turns comfortable
      if (step > cap) step = cap; else if (step < -cap) step = -cap;
      yaw = wrap(yaw + step);
    }
    up.set(0, 1, 0);
    if (r.lander) {
      // low-angle view from the landing zone / a cockpit cam right above the lander (screen-up stays up)
      if (mode === 'chase') { pos.set(A.x * 0.6, U * 3.2, H / 2 + U * 3.2); look.set(A.x, U * 0.4, A.z); }
      else { pos.set(A.x, U * 6.5, A.z + U * 1.6); look.set(A.x, 0, A.z + U * 2.6); up.set(0, 0, -1); }
      return true;
    }
    if (r.well) {
      // tall puzzle well: chase = in front and above, whole well in view; fp = from the well's top edge looking down
      if (mode === 'chase') { pos.set(A.x * 0.3, U * 9, H / 2 + U * 8); look.set(A.x * 0.2, 0, H * 0.02); }
      else { pos.set(A.x * 0.4, U * 11, -H / 2 - U * 1.5); look.set(A.x * 0.25, 0, H * 0.18); }
      return true;
    }
    if (r.follow) {
      // side-view platformers: a heading-locked camera above and in front of the board, so the
      // girders above/below and the ladders stay readable instead of being seen edge-on
      if (mode === 'chase') { pos.set(A.x * 0.85, U * 7.5, A.z + U * 6.5); look.set(A.x * 0.9, 0, A.z - U * 0.8); }
      else { pos.set(A.x, U * 4.2, A.z + U * 3.4); look.set(A.x, U * 0.3, A.z - U * 0.6); }
      return true;
    }
    f.set(Math.cos(yaw), 0, Math.sin(yaw));
    if (r.low) {
      // carts without a natural "forward": sit low behind the paddle / well floor and look across the board
      const cx = Number.isFinite(av.fx) ? av.fx - W / 2 : A.x;
      if (mode === 'chase') {
        pos.set(A.x * 0.55 + cx * 0.15, U * 2.1, A.z).addScaledVector(f, -U * 3.6);
        look.set(A.x * 0.5, U * 0.2, A.z).addScaledVector(f, U * 8);
      } else {
        pos.set(A.x, U * 1.15, A.z).addScaledVector(f, -U * 0.3);
        look.set(A.x * 0.7, U * 0.5, A.z).addScaledVector(f, U * 10);
      }
      return true;
    }
    if (mode === 'chase') {
      pos.set(A.x, U * (r.chUp ?? 2.3), A.z).addScaledVector(f, -U * (r.chBack ?? 4.2));
      look.set(A.x, U * 0.35, A.z).addScaledVector(f, U * 3);
    } else {
      pos.set(A.x, U * (r.fpEye ?? 1.25), A.z).addScaledVector(f, U * (r.fpFwd ?? 0.7));
      look.set(A.x, U * Math.min(0.6, (r.fpEye ?? 1.25) * 0.8), A.z).addScaledVector(f, U * 8);
    }
    return true;
  }
  return { target, U, reset() { has = false; lastAv = null; } };
}
