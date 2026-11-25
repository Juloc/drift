// The browser side of the shared world: the socket (with back-off), the frames, the clock and the interpolation of
// the other cars. Frame layouts: docs/ARCHITECTURE.md section 10. No DOM in here, so it can be tested in node.
import { angDiff } from '../core/rng.js';

export const POSE = 1, WELCOME = 0x80, ROSTER = 0x81, SNAPSHOT = 0x82, FIX = 0x83, BYE = 0x84, GLOW = 0x85, SNAPSHOT_FAR = 0x86;
export const DELAY_MS = 140, EXTRAPOLATE_MS = 250, MOVING_MS = 66, STILL_MS = 500;
const TAU = Math.PI * 2;

/** The 13-byte pose frame for a car state. */
export function encodePose(seq, s, beta, flags) {
  const b = new ArrayBuffer(13), v = new DataView(b);
  const c16 = (x) => Math.max(-32768, Math.min(32767, Math.round(x)));
  v.setUint8(0, POSE); v.setUint8(1, seq & 255);
  v.setInt16(2, c16(s.x * 20), true); v.setInt16(4, c16(s.z * 20), true);
  v.setUint16(6, Math.round(((((s.h % TAU) + TAU) % TAU) / TAU) * 65536) & 0xffff, true);
  v.setInt16(8, c16(s.vf * 50), true);
  v.setInt8(10, Math.max(-127, Math.min(127, Math.round(beta / (Math.PI / 128)))));
  v.setInt8(11, Math.max(-127, Math.min(127, Math.round((s.steer / 1.05) * 127))));
  v.setUint8(12, flags);
  return b;
}

/** 11 pose bytes (x z h vf beta steer flags) starting at `o` -> numbers. */
export function decodeEntry(v, o) {
  return {
    x: v.getInt16(o, true) / 20, z: v.getInt16(o + 2, true) / 20, h: (v.getUint16(o + 4, true) * TAU) / 65536,
    vf: v.getInt16(o + 6, true) / 50, beta: (v.getInt8(o + 8) * Math.PI) / 128, steer: (v.getInt8(o + 9) / 127) * 1.05, flags: v.getUint8(o + 10),
  };
}

/** Velocity vector (x, z) of a decoded pose: the nose direction plus the slip angle, at the speed along it. */
function velocity(p) {
  if (p.vx !== undefined) return [p.vx, p.vz];   // a far car: the velocity was worked out from its last two short entries
  const hv = p.h + p.beta, sp = p.vf / Math.max(0.3, Math.cos(p.beta));
  return [Math.sin(hv) * sp, Math.cos(hv) * sp];
}

/** Position and heading of a remote car at render time `t` (ms, server clock) from its snapshots. */
export function interpolate(buf, t) {
  const n = buf.length;
  if (!n) return null;
  const first = buf[0], last = buf[n - 1];
  if (t <= first.t) return { ...first };
  if (t >= last.t) {
    const dt = Math.min(t - last.t, EXTRAPOLATE_MS) / 1000, [vx, vz] = velocity(last);
    return { ...last, x: last.x + vx * dt, z: last.z + vz * dt };
  }
  let i = n - 2;
  while (i > 0 && buf[i].t > t) i--;
  const a = buf[i], b = buf[i + 1], span = (b.t - a.t) / 1000, k = (t - a.t) / (b.t - a.t);
  const [ax, az] = velocity(a), [bx, bz] = velocity(b);
  const k2 = k * k, k3 = k2 * k, h00 = 2 * k3 - 3 * k2 + 1, h10 = k3 - 2 * k2 + k, h01 = -2 * k3 + 3 * k2, h11 = k3 - k2;
  const near = k < 0.5 ? a : b;
  return {
    x: h00 * a.x + h10 * span * ax + h01 * b.x + h11 * span * bx,
    z: h00 * a.z + h10 * span * az + h01 * b.z + h11 * span * bz,
    h: a.h + angDiff(a.h, b.h) * k, vf: a.vf + (b.vf - a.vf) * k, beta: a.beta + (b.beta - a.beta) * k,
    steer: a.steer + (b.steer - a.steer) * k, flags: near.flags,
  };
}

export class WorldClient {
  /** @param {{url: string, onWelcome?, onRoster?, onFix?, onBye?, onState?, onJson?}} o */
  constructor(o) {
    Object.assign(this, { onWelcome() {}, onRoster() {}, onFix() {}, onBye() {}, onState() {}, onJson() {} }, o);
    this.ws = null; this.seq = 0; this.lastSend = 0; this.retry = 1000; this.stop = false;
    this.glow = new Map();   // id -> hue index of the underglow (a frame of its own: 0x85)
    this.me = null; this.roster = new Map(); this.buffers = new Map(); this.lastSeen = new Map(); this.lastNear = new Map();
    this.base = 0; this.lastRaw = null; this.samples = []; this.offset = null;
    this.bytesIn = 0; this.bytesOut = 0; this.framesIn = 0; this.framesOut = 0;
  }
  get connected() { return this.ws?.readyState === 1; }
  get count() { return this.roster.size; }
  connect() {
    this.stop = false;
    const ws = (this.ws = new WebSocket(this.url));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { this.retry = 1000; this.onState('open'); };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') { try { this.onJson(JSON.parse(e.data)); } catch { /* a text frame that is not JSON is ignored */ } return; }
      this.handle(e.data);
    };
    ws.onclose = () => {
      this.onState('closed');
      this.buffers.clear(); this.roster.clear(); this.lastRaw = null; this.samples = []; this.offset = null;
      if (!this.stop) { setTimeout(() => !this.stop && this.connect(), this.retry); this.retry = Math.min(8000, this.retry * 2); }
    };
  }
  close() { this.stop = true; this.ws?.close(); }
  /** A small JSON control message (signed-in lobby: invitations and race messages). */
  sendJson(obj) { if (this.connected) this.ws.send(JSON.stringify(obj)); }

  handle(data) {
    const v = new DataView(data);
    this.bytesIn += data.byteLength + 2; this.framesIn++;
    switch (v.getUint8(0)) {
      case WELCOME: this.me = { id: v.getUint8(1), world: v.getUint8(2), hue: v.getUint8(3) }; this.onWelcome(this.me); break;
      case ROSTER: {
        const n = v.getUint8(1), next = new Map(); let o = 2;
        for (let i = 0; i < n; i++) {
          const id = v.getUint8(o), car = v.getUint8(o + 1), hue = v.getUint8(o + 2), len = v.getUint8(o + 3);
          next.set(id, { id, car, hue, name: new TextDecoder().decode(new Uint8Array(data, o + 4, len)) });
          o += 4 + len;
        }
        this.roster = next;
        for (const id of [...this.glow.keys()]) if (!next.has(id)) this.glow.delete(id);
        for (const id of [...this.buffers.keys()]) if (!next.has(id)) { this.buffers.delete(id); this.lastSeen.delete(id); this.lastNear.delete(id); }
        if (this.me) this.me = { ...this.me, ...next.get(this.me.id) };
        this.onRoster(next);
        break;
      }
      case SNAPSHOT: {
        const n = v.getUint8(1), now = performance.now(), stamp = this.stampOf(v.getUint16(2, true), now);
        for (let i = 0; i < n; i++) {
          const o = 4 + i * 12, id = v.getUint8(o), p = decodeEntry(v, o + 1);
          p.t = stamp;
          this.push(id, p, now);
        }
        break;
      }
      case SNAPSHOT_FAR: {
        // the cars outside the interest radius: id, x, z, heading, a few times a second; the speed is worked out from the last two entries
        const n = v.getUint8(1), now = performance.now(), stamp = this.stampOf(v.getUint16(2, true), now);
        for (let i = 0; i < n; i++) {
          const o = 4 + i * 7, id = v.getUint8(o);
          const p = { x: v.getInt16(o + 1, true) / 20, z: v.getInt16(o + 3, true) / 20, h: (v.getUint16(o + 5, true) * TAU) / 65536, vf: 0, beta: 0, steer: 0, flags: 0, far: true, t: stamp };
          const buf = this.buffers.get(id), last = buf?.[buf.length - 1];
          if (last && stamp > last.t) {
            const dt = (stamp - last.t) / 1000;
            if (dt < 2) { p.vx = (p.x - last.x) / dt; p.vz = (p.z - last.z) / dt; p.vf = Math.hypot(p.vx, p.vz); }
          }
          this.push(id, p, now);
        }
        break;
      }
      case GLOW: {
        const n = v.getUint8(1), next = new Map();
        for (let i = 0; i < n; i++) next.set(v.getUint8(2 + i * 2), v.getUint8(3 + i * 2) - 1);
        this.glow = next;
        break;
      }
      case FIX: this.onFix({ x: v.getInt16(1, true) / 20, z: v.getInt16(3, true) / 20, h: (v.getUint16(5, true) * TAU) / 65536 }); break;
      case BYE: this.stop = true; this.onBye(v.getUint8(1)); break; // the page offers a tap to rejoin
    }
  }

  /** Send the own pose when it is due: every 66 ms while moving, every 500 ms while standing, never while hidden. */
  sendPose(s, beta, flags, moving, now = performance.now()) {
    if (!this.connected || document.hidden) return;
    if (now - this.lastSend < (moving ? MOVING_MS : STILL_MS)) return;
    if (this.ws.bufferedAmount > 2048) return;
    this.lastSend = now;
    this.ws.send(encodePose(this.seq++, s, beta, flags));
    this.bytesOut += 13 + 6; this.framesOut++;
  }

  /** Server time of a frame's 16-bit stamp, and the clock offset (the smallest of the last 10 s is the least delayed packet). */
  stampOf(raw, now) {
    if (this.lastRaw !== null && raw < this.lastRaw - 30000) this.base += 65536;
    this.lastRaw = raw;
    const stamp = this.base + raw;
    this.samples.push([now, stamp - now]);
    while (this.samples.length > 1 && now - this.samples[0][0] > 10000) this.samples.shift();
    this.offset = Math.min(...this.samples.map((s) => s[1]));
    return stamp;
  }
  push(id, p, now) {
    let buf = this.buffers.get(id);
    if (!buf) this.buffers.set(id, (buf = []));
    if (!buf.length || buf[buf.length - 1].t < p.t) buf.push(p);
    if (buf.length > 8) buf.shift();
    this.lastSeen.set(id, now);
    if (!p.far) this.lastNear.set(id, now);
  }

  /** The other cars as they should be drawn now: [{ id, x, z, h, vf, beta, steer, flags }]. */
  sample(now = performance.now()) {
    if (this.offset === null) return [];
    const t = now + this.offset - DELAY_MS, out = [];
    for (const [id, buf] of this.buffers) {
      if (now - (this.lastSeen.get(id) ?? 0) > 1500) continue; // not heard of for 1.5 s: hidden tab, leave it out
      const p = interpolate(buf, t);
      if (p) out.push({ id, ...p, far: buf[buf.length - 1].far === true && now - (this.lastNear.get(id) ?? -Infinity) > 600 });
    }
    return out;
  }
}
