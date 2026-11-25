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
    const travel = v > 4 ? Math.atan2(s.vx, s.vz) : s.h;
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
export { HEAD };
