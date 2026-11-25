// The practice partner for tandem drifting: a bot that drives a drift circle (the orbit bot of sim/bot.js: speed, then the handbrake once, then a held slide) on the map,
// and the local tandem judgement between you and it. The scoring is the one of the server (sim/tandem.js); nothing here is sent or kept.
// A drift circle is the only line it knows; a line per map (the ideal line with its angles) comes with the maps of the open world.
import { step, makeCar, bodySlip, bodyVelocity } from './physics.js';
import { collide, surfaceAt } from './map.js';
import { orbitBot } from './bot.js';
import { tandemPair, newTandem, tandemStep } from './tandem.js';
import { DT } from './physics.js';

/** Where the bot starts on the car park (a clear run of 40 m and an open circle, found by trying: it drifts a steady circle at about 10 m/s without touching a wall). */
export const PRACTICE_START = { x: 30, z: -35, h: Math.PI / 2 };

/** The wire's pose of a car state. */
export const poseOf = (s) => ({ x: s.x, z: s.z, h: s.h, vf: bodyVelocity(s).vf, beta: bodySlip(s) });

export class PracticeBot {
  /** @param {{x:number,z:number,h:number}} start @param {object} car the car's numbers (as the player's) @param {number} dir 1 = circle to the right, -1 = left */
  constructor(map, car, start, dir = 1) {
    this.map = map; this.car = car; this.dir = dir; this.t = 0;
    this.state = makeCar(start.x, start.z, start.h);
  }
  /** One fixed step (DT). */
  step() {
    const mu = surfaceAt(this.map, this.state.x, this.state.z).mu;
    this.state = collide(this.map, step(this.state, orbitBot(this.t, this.state, { start: 1.5, dir: this.dir }), this.car, mu, DT));
    this.t += DT;
    return this.state;
  }
}

/** Judges you against the bot (or any partner) with the same functions as the server, at the fixed step. */
export class TandemPractice {
  constructor() { this.tandem = newTandem(); this.best = 0; this.lastBank = null; }
  /** @returns the tandem state (mult, role, pending, event ...) after this step */
  update(me, partner, dt) {
    const pair = tandemPair(poseOf(me), poseOf(partner));
    const p = poseOf(me);
    this.tandem = tandemStep(this.tandem, pair.active ? { q: pair.q, role: pair.role[0], speed: Math.abs(p.vf), slip: p.beta } : null, dt);
    if (this.tandem.event) { this.lastBank = this.tandem.event.points; this.best = Math.max(this.best, this.tandem.event.points); }
    return this.tandem;
  }
}
