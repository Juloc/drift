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
    const side = C.side + this.sw, up0 = (P.up + U.lift) * U.zoom, dist0 = P.dist * U.zoom, cover = this.cover ?? g, eyeY = this.gy + 1.0;
    // the line of sight: the camera must see the car. The land between them (the inside of a hairpin, the cut on the uphill side, a free orbit into the hill) is sampled at 6
    // points; where the land (+0.6 m) is above the line, the camera is raised by what is needed (a raise of h lifts the line at a point t of the way by h * (1 - t)); needing
    // more than 4 m, it is pulled closer to the car instead (at most to 0.6 of its distance). Fast up, slow down, like the extra height below.
    const place = (k) => { const d = dist0 * k, u = up0 * k, px = this.x - fx * d + rx * side, pz = this.z - fz * d + rz * side; return [px, pz, this.gy + u]; };
    const raiseFor = (px, pz, py) => { let r = 0; for (let i = 0; i < 6; i++) { const t = 0.15 + (0.75 * i) / 5, x = px + (this.x - px) * t, z = pz + (this.z - pz) * t, y = py + (eyeY - py) * t; r = Math.max(r, (cover(x, z) + 0.6 - y) / (1 - t)); } return Math.max(0, r); };
    let k = 1, [cx, cz, cy] = place(1), r = raiseFor(cx, cz, cy + this.ex);
    while (r > 4 && k > 0.6) { k = Math.max(0.6, k - 0.1); [cx, cz, cy] = place(k); r = raiseFor(cx, cz, cy + this.ex); }
    this.pull = this.pull === undefined || dt === 0 ? k : k < this.pull ? damp(this.pull, k, 8, dt) : damp(this.pull, k, 1.5, dt);
    if (Math.abs(this.pull - k) > 0.005) { [cx, cz, cy] = place(this.pull); r = raiseFor(cx, cz, cy + this.ex); }
    const up = up0 * this.pull;
    // never under the road beside it (a hairpin below, a crest in front): the extra height comes quickly and goes slowly, so it never jerks
    const need = Math.max(0, g(cx, cz) + 1.1 - cy, this.ex + r);
    this.ex = dt === 0 ? need : need > this.ex ? damp(this.ex, need, 7, dt) : damp(this.ex, need, 2, dt);
    cy += this.ex;
    const lx = this.x + Math.sin(ty) * C.look, lz = this.z + Math.cos(ty) * C.look;
    this.camera.position.set(X(cx), cy, cz);
    this.camera.lookAt(X(lx), this.gy + C.lookY + Math.min(0, up - P.up) * 0.2, lz);
    if (this.camera.fov !== C.fov) { this.camera.fov = C.fov; this.camera.updateProjectionMatrix(); }
  }
}

/**
 * The action camera (the test page of the new driving model; the game keeps its calm chase): close and low, behind the direction the car TRAVELS (not its nose), so in a drift the
 * car turns inside the picture and its side shows. 5.2 m behind, 1.55 m up, up to 0.8 m to the outside of the slide, the view opens from 58 to 74 degrees with speed, the horizon leans at
 * most 2.5 degrees with the sideways g. NO shake and no bob: everything is damped, and it reads the drawn (blended) pose only.
 */
export class ActionCam {
  constructor(camera, { dist = 5.2, up = 1.55, ahead = 1.2, lookY = 0.6, side = 0.8, fov0 = 58, fov1 = 74, maxRoll = 2.5 } = {}) {
    Object.assign(this, { camera, dist, up, ahead, lookY, side, fov0, fov1, maxRoll });
    this.ready = false; this.fov = fov0;
  }
  snap(s) { this.ready = false; this.update(s, 0, 0); }
  update(s, top, dt) {
    const g = this.ground ?? (() => 0), cover = this.cover ?? g, sp = speedOf(s);
    const vf = s.vx * Math.sin(s.h) + s.vz * Math.cos(s.h);
    const travel = sp > 0.5 && vf > -1 ? Math.atan2(s.vx, s.vz) : s.h, slip = angDiff(s.h, travel);   // (+: the travel direction is to the right of the nose)
    const blend = clamp((sp - 3) / 5, 0, 1) * 0.65 * (Math.abs(slip) > 2 ? 0 : 1) * (vf > -1 ? 1 : 0);   // nose at a crawl, 0.65 travel above 8 m/s (not in a spin or backwards)
    const aim = s.h + slip * blend;
    if (this.ready && Math.hypot(s.x - this.x, s.z - this.z) > 12) this.ready = false;   // put somewhere else: the camera is there at once
    if (!this.ready) { Object.assign(this, { yaw: aim, x: s.x, z: s.z, gy: g(s.x, s.z), off: 0, roll: 0, ex: 0, ready: true }); this.fov = this.fov0; }
    this.x += s.vx * dt; this.z += s.vz * dt; this.x = damp(this.x, s.x, 8, dt); this.z = damp(this.z, s.z, 8, dt);   // carried along by the speed, only the rest is damped
    this.gy = damp(this.gy, g(s.x, s.z), 3.5, dt);
    this.yaw += angDiff(this.yaw, aim) * (1 - Math.exp(-dt / 0.35));
    const offTo = -this.side * Math.sin(clamp(slip, -1.2, 1.2));   // to the outside of the slide: a car turned to the right of its travel has its tail out to the left
    this.off = damp(this.off, offTo, 3, dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = fz, rz = -fx;
    const cx = this.x - fx * this.dist + rx * this.off, cz = this.z - fz * this.dist + rz * this.off;
    let cy = this.gy + this.up;
    // never nearer than 1.1 m to the road under it, and the car in sight over the land between (raised quickly, lowered slowly)
    let need = Math.max(0, g(cx, cz) + 1.1 - cy);
    for (let i = 1; i <= 5; i++) { const t = i / 6; need = Math.max(need, (cover(cx + (this.x - cx) * t, cz + (this.z - cz) * t) + 0.6 - (cy + (this.gy + 0.9 - cy) * t)) / (1 - t)); }
    this.ex = dt === 0 ? need : need > this.ex ? damp(this.ex, need, 7, dt) : damp(this.ex, need, 2, dt);
    cy += this.ex;
    const cam = this.camera;
    cam.position.set(X(cx), cy, cz);
    cam.up.set(0, 1, 0);
    cam.lookAt(X(s.x + Math.sin(aim) * this.ahead), this.gy + this.lookY, s.z + Math.cos(aim) * this.ahead);
    const rollTo = clamp(((s.alat ?? 0) / 9.81) * 2, -1, 1) * this.maxRoll;   // leans into the bend
    this.roll = damp(this.roll, rollTo, 1 / 0.3, dt);
    cam.rotateZ((-this.roll * Math.PI) / 180);
    const fov = this.fov0 + (this.fov1 - this.fov0) * (1 - Math.pow(1 - clamp(sp / 33.3, 0, 1), 2));
    this.fov = dt === 0 ? fov : damp(this.fov, fov, 3, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
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
  /** The height of the land the camera must see over (the drawn terrain: view/look/field.js `height`); without it the road's height is used. */
  setCover(cover) { for (const c of Object.values(this.cams)) c.cover = cover; }
  /** The chase camera of another look (another map). */
  setLook(C) { if (this.cams.chase instanceof LookChase) this.cams.chase.C = C; }
  get hidesCar() { return this.cams[this.mode].hides === true; }
  set(mode, s) { if (!this.cams[mode]) return; this.mode = mode; this.camera.fov = mode === 'chase' ? (this.cams.chase.C?.fov ?? 55) : this.cams[mode].baseFov; this.camera.updateProjectionMatrix(); this.cams[mode].fov = this.camera.fov; if (s) this.cams[mode].snap(s); }
  cycle(s) { this.set(CAMERAS[(CAMERAS.indexOf(this.mode) + 1) % CAMERAS.length], s); return this.mode; }
  snap(s) { this.cams[this.mode].snap(s); }
  update(s, top, dt) { this.cams[this.mode].update(s, top, dt); }
}
export { HEAD };
