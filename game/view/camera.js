// The follow camera: a spring behind the car that looks along a blend of the nose and the direction of travel, so
// the slide stays on screen. The field of view opens with speed. Angles are the simulation's (heading grows to the right).
import { damp, angDiff } from '../core/rng.js';
import { speedOf } from '../sim/physics.js';
import { X, HEAD } from './space.js';

export class FollowCam {
  constructor(camera, { dist = 11, height = 5.6, look = 5 } = {}) {
    this.camera = camera; this.dist = dist; this.height = height; this.look = look;
    this.yaw = 0; this.x = 0; this.z = 0; this.fov = 55; this.ready = false;
  }
  snap(s) { this.ready = false; this.update(s, 0, 0); }
  /** s = drawn car state (interpolated), top = the car's top speed, dt = frame time in seconds. */
  update(s, top, dt) {
    const v = speedOf(s);
    const reversing = s.vx * Math.sin(s.h) + s.vz * Math.cos(s.h) < -1;   // going backwards: the view stays behind the nose, it does not swing round to face the way the car goes
    const travel = v > 4 && !reversing ? Math.atan2(s.vx, s.vz) : s.h;
    const aim = s.h + angDiff(s.h, travel) * 0.6; // lean towards where the car is really going
    if (!this.ready) { this.yaw = aim; this.x = s.x; this.z = s.z; this.ready = true; }
    this.yaw += angDiff(this.yaw, aim) * (1 - Math.exp(-3.2 * dt));
    this.x = damp(this.x, s.x, 9, dt); this.z = damp(this.z, s.z, 9, dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dist = this.dist + Math.min(4, v * 0.06);
    const cam = this.camera;
    cam.position.set(X(this.x - fx * dist), this.height + Math.min(1.6, v * 0.03), this.z - fz * dist);
    cam.lookAt(X(this.x + fx * this.look), 1.0, this.z + fz * this.look);
    const fov = 55 + 13 * Math.min(1, v / (top || 35));
    if (Math.abs(fov - this.fov) > 0.05) { this.fov = damp(this.fov, fov, 3, dt); cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

/**
 * A camera in the car: on the bonnet (the body stays in view) or in the cockpit (the body is hidden, the view is from the driver's eyes). It looks along the nose, leaning
 * towards the direction of travel by `lean` (so a slide opens the view into the corner); the field of view opens a little with speed.
 */
export class DriverCam {
  constructor(camera, { fwd = 0.9, up = 1.12, lean = 0.25, fov = 68, hides = false } = {}) {
    Object.assign(this, { camera, fwd, up, lean, baseFov: fov, hides });
    this.yaw = 0; this.fov = fov; this.ready = false;
  }
  snap(s) { this.ready = false; this.update(s, 0, 0); }
  update(s, top, dt) {
    const v = speedOf(s);
    const reversing = s.vx * Math.sin(s.h) + s.vz * Math.cos(s.h) < -1;   // going backwards: the view stays behind the nose, it does not swing round to face the way the car goes
    const travel = v > 4 && !reversing ? Math.atan2(s.vx, s.vz) : s.h;
    const aim = s.h + angDiff(s.h, travel) * this.lean;
    if (!this.ready) { this.yaw = aim; this.ready = true; }
    this.yaw += angDiff(this.yaw, aim) * (1 - Math.exp(-8 * dt));   // quick: the eyes are in the car
    const hx = Math.sin(s.h), hz = Math.cos(s.h);                     // the car's nose; the camera sits on it
    const cam = this.camera;
    const gy = this.ground ? this.ground(s.x, s.z) : 0;   // the road's drawn height (the physics is flat)
    cam.position.set(X(s.x + hx * this.fwd), this.up + gy, s.z + hz * this.fwd);
    cam.lookAt(X(s.x + hx * this.fwd + Math.sin(this.yaw) * 20), this.up - 0.12 + gy, s.z + hz * this.fwd + Math.cos(this.yaw) * 20);
    const fov = this.baseFov + 10 * Math.min(1, v / (top || 35));
    if (Math.abs(fov - this.fov) > 0.05) { this.fov = damp(this.fov, fov, 3, Math.max(dt, 0.001)); cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

/** The chase camera's presets: how far behind the car and how high above the road it sits (metres). */
export const PRESETS = { near: { dist: 5.4, up: 2.5 }, follow: { dist: 7.6, up: 3.5 }, far: { dist: 11.5, up: 5 }, top: { dist: 7, up: 10 } };
export const PRESET_NAMES = Object.keys(PRESETS);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The chase camera of a look (look.camera: side, look, lookY, travel, fov, turn, turnDrift, swing; its distance and height are the presets'): behind the car and above it, looking along where the
 * car is going (between its nose and its travel). It is NOT fixed to the car: the point it follows, the road's height under it and the direction it looks are all damped, so a bump, a
 * crest, a spring or a knock does not shake the picture (docs/STATE: the owner got sick of the old one).
 * The player can turn it round the car (`user.yaw`), tilt it (`user.lift`, metres of height) and zoom (`user.zoom`); with `user.auto` the angle and height come back by themselves a moment after
 * the player lets go (zoom stays), without it the camera stays where it was put.
 */
export class LookChase {
  constructor(camera, C, ground = null) {
    this.camera = camera; this.C = C; this.ground = ground; this.fov = C.fov;
    this.user = { preset: 'follow', auto: true, yaw: 0, lift: 0, zoom: 1 };
    this.idle = 9; this.ready = false;
  }
  /** the player is dragging: the camera follows the hand and does not go back */
  nudge(dyaw, dlift) { this.user.yaw += dyaw; this.user.lift = clamp(this.user.lift + dlift, -1.5, 9); this.idle = 0; }
  zoomBy(f) { this.user.zoom = clamp(this.user.zoom * f, 0.55, 2.4); }
  snap(s) { this.ready = false; this.sw = undefined; this.td = undefined; this.update(s, 0, 0); }
  update(s, top, dt) {
    const C = this.C, g = this.ground ?? (() => 0), U = this.user, P = PRESETS[U.preset] ?? PRESETS.follow;
    // the way the car goes counts the faster it rolls forward (nothing at a crawl or backwards: then the nose alone), blended in softly: a switch at one speed made the
    // view jump when a car slowed down in a slide or turned round (14 degrees in one picture, measured by tools/ridecheck.mjs)
    const vf = s.vx * Math.sin(s.h) + s.vz * Math.cos(s.h), sp = speedOf(s), moving = Math.max(0, Math.min(1, (sp - 2) / 4)) * Math.max(0, Math.min(1, (vf + 1) / 2));
    const travel = s.h + (sp > 0.5 ? angDiff(s.h, Math.atan2(s.vx, s.vz)) : 0) * moving;
    const aim = s.h + angDiff(s.h, travel) * C.travel;
    if (this.ready && Math.hypot(s.x - this.x, s.z - this.z) > 12) this.ready = false;   // the car was put somewhere else (a restart, a start place): the camera is there at once, it does not fly after it
    if (!this.ready) { this.yaw = aim; this.x = s.x; this.z = s.z; this.gy = g(s.x, s.z); this.ex = 0; this.ready = true; }
    // everything that follows the car is damped: its place, the height of the road under it, the direction (slowly: a slide does not swing the picture)
    // the point the camera follows MOVES WITH the car (its speed carries it along) and only what is left over is damped: a knock or a wall is still softened, but the
    // camera no longer hangs on an elastic band (it used to trail by the speed over 8: three metres at 100 km/h, so the car slid away and came back with every
    // change of speed: the owner's "rubber-banding")
    this.x += s.vx * dt; this.z += s.vz * dt;
    this.x = damp(this.x, s.x, 8, dt); this.z = damp(this.z, s.z, 8, dt);
    this.gy = damp(this.gy, g(s.x, s.z), 3.5, dt);
    this.yaw += angDiff(this.yaw, aim) * (1 - Math.exp(-2.2 * dt));
    // after the player let go, the angle and the height come back to the preset (zoom stays)
    this.idle += dt;
    if (U.auto && this.idle > 1.4) { const k = 1 - Math.exp(-1.6 * dt); U.yaw -= angDiff(0, U.yaw) * k; U.lift -= U.lift * k; }
    const yaw = this.yaw + U.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
    // `turn` (degrees, + = to the right) turns the view away from the road; `turnDrift`: the car stays towards one side of the picture in a slide; `swing`: the camera swings out with the drift angle, softly
    // (the turn with the drift follows the angle softly too: in a spin the angle flips from one side to the other in an instant)
    const slip = angDiff(travel, s.h), driftTo = clamp(slip / 0.6, -1, 1) * (Math.abs(slip) > 2 ? 0 : 1);
    this.td = dt > 0 && this.td !== undefined ? damp(this.td, driftTo, 3, dt) : driftTo;
    const ty = this.yaw + (((C.turn ?? 0) + (C.turnDrift ?? 0) * this.td) * Math.PI) / 180;
    const swingTo = (C.swing ?? 0) * angDiff(travel, s.h);
    this.sw = (this.sw ?? swingTo) + (swingTo - (this.sw ?? swingTo)) * (1 - Math.exp(-2 * dt));
    const side = C.side + this.sw, dist = P.dist * U.zoom, up = (P.up + U.lift) * U.zoom;
    const cx = this.x - fx * dist + rx * side, cz = this.z - fz * dist + rz * side;
    let cy = this.gy + up;
    // never under the road beside it (a hairpin below, a crest in front): the extra height comes quickly and goes slowly, so it never jerks
    const need = Math.max(0, g(cx, cz) + 1.1 - cy);
    this.ex = need > this.ex ? damp(this.ex, need, 10, dt) : damp(this.ex, need, 2, dt);
    cy += this.ex;
    const lx = this.x + Math.sin(ty) * C.look, lz = this.z + Math.cos(ty) * C.look;
    this.camera.position.set(X(cx), cy, cz);
    this.camera.lookAt(X(lx), this.gy + C.lookY + Math.min(0, up - P.up) * 0.2, lz);
    if (this.camera.fov !== C.fov) { this.camera.fov = C.fov; this.camera.updateProjectionMatrix(); }
  }
}

/** The cameras of the game: chase (the default), bonnet, cockpit. `cycle()` goes to the next (the key C, a pad button). */
export const CAMERAS = ['chase', 'bonnet', 'cockpit'];
export class CameraRig {
  /** `chase`: { look: look.camera, ground } for the look's chase camera, or the old spring camera's options. */
  constructor(camera, chase) {
    this.camera = camera;
    this.cams = { chase: chase?.look ? new LookChase(camera, chase.look, chase.ground) : new FollowCam(camera, chase), bonnet: new DriverCam(camera, { fwd: 0.9, up: 1.12, lean: 0.25, fov: 68 }), cockpit: new DriverCam(camera, { fwd: 0.15, up: 1.2, lean: 0.3, fov: 74, hides: true }) };
    this.mode = 'chase';
  }
  /** The road's drawn height at a point, for every camera (it changes with the map). */
  setGround(ground) { for (const c of Object.values(this.cams)) c.ground = ground; }
  /** The chase camera of another look (another map). */
  setLook(C) { if (this.cams.chase instanceof LookChase) this.cams.chase.C = C; }
  get hidesCar() { return this.cams[this.mode].hides === true; }
  set(mode, s) { if (!this.cams[mode]) return; this.mode = mode; this.camera.fov = mode === 'chase' ? (this.cams.chase.C?.fov ?? 55) : this.cams[mode].baseFov; this.camera.updateProjectionMatrix(); this.cams[mode].fov = this.camera.fov; if (s) this.cams[mode].snap(s); }
  cycle(s) { this.set(CAMERAS[(CAMERAS.indexOf(this.mode) + 1) % CAMERAS.length], s); return this.mode; }
  snap(s) { this.cams[this.mode].snap(s); }
  update(s, top, dt) { this.cams[this.mode].update(s, top, dt); }
}
export { HEAD };
