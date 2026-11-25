// Writes tests/vectors/tandem.json: pairs of poses through game/sim/tandem.js with the numbers it gives, and chains through tandemStep.
// The browser's test and the server's C# test (src/Drift/Race/Tandem.cs) both read this file, so the two cannot drift apart.
// Run: node tools/make-tandem-vectors.mjs
import { writeFileSync } from 'node:fs';
import { tandemPair, newTandem, tandemStep } from '../game/sim/tandem.js';

const car = (x, z, h, vf, beta) => ({ x, z, h, vf, beta });
const pairs = {
  'side by side, close, same angle': [car(0, 0, 0, 22, 0.5), car(4, 0, 0, 22, 0.5)],
  'one behind the other, close': [car(0, 0, 0, 22, 0.5), car(0.5, 5, 0, 22, 0.5)],
  'too far apart': [car(0, 0, 0, 22, 0.5), car(12, 0, 0, 22, 0.5)],
  'one is not drifting': [car(0, 0, 0, 22, 0.5), car(4, 0, 0, 22, 0.05)],
  'drifting the other way': [car(0, 0, 0, 22, 0.5), car(4, 0, 0, 22, -0.5)],
  'pointing different ways': [car(0, 0, 0, 22, 0.5), car(4, 0, 1.2, 22, 0.5)],
  'very different slip angles': [car(0, 0, 0, 22, 0.3), car(4, 0, 0.1, 22, 0.8)],
  'too slow': [car(0, 0, 0, 6, 0.5), car(4, 0, 0, 6, 0.5)],
  'the heading wraps round the circle': [car(0, 0, 6.2, 22, 0.5), car(4, 0, 0.1, 22, 0.5)],
  'edge of the range': [car(0, 0, 0, 22, 0.5), car(9.5, 0, 0, 22, 0.5)],
};
const out = { pairs: {}, chains: {} };
for (const [name, [a, b]] of Object.entries(pairs)) {
  const r = tandemPair(a, b);
  out.pairs[name] = { a, b, active: r.active, q: +r.q.toFixed(6), gap: +r.gap.toFixed(6), role: r.role };
}
const dt = 1 / 15;
const chains = {
  'a clean tandem of 6 seconds then a break': [...Array(90).fill({ q: 0.8, role: 'lead', speed: 22, slip: 0.5 }), ...Array(40).fill(null)],
  'a short break is bridged': [...Array(30).fill({ q: 0.8, role: 'chase', speed: 20, slip: 0.5 }), ...Array(10).fill(null), ...Array(30).fill({ q: 0.8, role: 'chase', speed: 20, slip: 0.5 }), ...Array(40).fill(null)],
  'a long break makes two chains': [...Array(30).fill({ q: 0.6, role: 'lead', speed: 20, slip: 0.5 }), ...Array(40).fill(null), ...Array(30).fill({ q: 0.6, role: 'lead', speed: 20, slip: 0.5 }), ...Array(40).fill(null)],
  'a long perfect tandem reaches the top multiplier': [...Array(300).fill({ q: 1, role: 'lead', speed: 26, slip: 0.6 }), ...Array(30).fill(null)],
  'nothing without a partner': Array(60).fill(null),
};
for (const [name, steps] of Object.entries(chains)) {
  let st = newTandem(); const events = [], trace = [];
  steps.forEach((o, i) => {
    st = tandemStep(st, o, dt);
    if (st.event) events.push({ step: i, points: st.event.points });
    if (i % 10 === 9 || i === steps.length - 1) trace.push({ step: i, pending: +st.pending.toFixed(6), banked: +st.banked.toFixed(6), mult: +st.mult.toFixed(6), q: +st.q.toFixed(6), role: st.role });
  });
  out.chains[name] = { dt, steps, events, trace, banked: +st.banked.toFixed(6) };
}
writeFileSync(new URL('../tests/vectors/tandem.json', import.meta.url), JSON.stringify(out) + '\n');
console.log('wrote', Object.keys(out.pairs).length, 'pairs and', Object.keys(out.chains).length, 'chains');
