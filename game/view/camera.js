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

/**
 * The chase camera of a look (look.camera: dist, height, side, look, lookY, travel, fov, turn): low, close behind the car and a little to its right, looking along where the car is going (between
 * its nose and its travel) and so down the road; it follows softly and sits on the road's drawn height (`ground(x, z)`, the physics underneath is flat).
 */
export class LookChase {
  constructor(camera, C, ground = null) { this.camera = camera; this.C = C; this.ground = ground; this.yaw = 0; this.ready = false; this.fov = C.fov; }
  snap(s) { this.ready = false; this.update(s, 0, 0); }
  update(s, top, dt) {
    const C = this.C, g = this.ground ?? (() => 0);
    const reversing = s.vx * Math.sin(s.h) + s.vz * Math.cos(s.h) < -1;
    const travel = speedOf(s) > 4 && !reversing ? Math.atan2(s.vx, s.vz) : s.h;
    const aim = s.h + angDiff(s.h, travel) * C.travel;
    if (!this.ready) { this.yaw = aim; this.ready = true; }
    this.yaw += angDiff(this.yaw, aim) * (1 - Math.exp(-4 * dt));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = fz, rz = -fx;   // forward and right (simulation axes)
    // `turn` (degrees, + = to the right) turns the view away from the road, e.g. into the valley beside it
    const ty = this.yaw + ((C.turn ?? 0) * Math.PI) / 180;
    const cx = s.x - fx * C.dist + rx * C.side, cz = s.z - fz * C.dist + rz * C.side, lx = s.x + Math.sin(ty) * C.look, lz = s.z + Math.cos(ty) * C.look;
    this.camera.position.set(X(cx), C.height + Math.max(g(cx, cz), g(s.x, s.z)), cz);
    this.camera.lookAt(X(lx), C.lookY + g(lx, lz), lz);
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
