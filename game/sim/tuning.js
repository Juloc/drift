// Tuning: four sliders with a counterweight each and a budget of 10 points, so nothing is just better. A slider goes from -3 to +3 and costs its
// distance from 0 in points; the sum of the costs may not pass 10 (all four at the end would be 12). Pure functions; the server has the same
// formula for the one number it needs (the top speed, to judge lap times: TuningRules in src/Drift/Garage/Tuning.cs).
export const TUNE_MAX = 3, BUDGET = 10;
export const NAMES = ['steer', 'balance', 'power', 'handbrake'];
export const NONE = { steer: 0, balance: 0, power: 0, handbrake: 0 };

export const cost = (t) => NAMES.reduce((s, k) => s + Math.abs(t[k]), 0);
export const valid = (t) => NAMES.every((k) => Number.isInteger(t[k]) && Math.abs(t[k]) <= TUNE_MAX) && cost(t) <= BUDGET;
export const isTuned = (t) => cost(t) > 0;
/** The top speed factor of a tuning (more steering angle costs a little top speed). */
export const topFactor = (t) => 1 - 0.012 * t.steer;

/**
 * The car's five numbers changed by a tuning (a new object):
 *  steer     + more wheel angle (lock x 1.08 per point), - a little top speed (x 0.988 per point)
 *  balance   + more grip at the front and less at the rear (8 % per point either way: the car turns in harder but lets go less), - the other way
 *  power     + more power (x 1.07 per point), - less grip (x 0.97 per point: the weight)
 *  handbrake + more bite of the handbrake (rear grip with it x 0.88 per point less), - a little less able to hold a slide (slide -0.02 per point)
 */
export function applyTuning(car, t = NONE) {
  const slide = Math.min(0.95, Math.max(0.4, car.slide - 0.02 * t.handbrake));
  return {
    ...car,
    power: car.power * (1 + 0.07 * t.power),
    top: car.top * topFactor(t),
    grip: car.grip * (1 - 0.03 * t.power),
    slide,
    lockScale: 1 + 0.08 * t.steer,
    balance: 0.08 * t.balance,
    hbGrip: Math.max(0.05, 0.2 * (1 - 0.12 * t.handbrake)),   // 0.2 is K.hbGrip
  };
}
