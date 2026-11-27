// The driving display in the mockups' style (lab-drive-hud.css): lap and times, the drift score with its multiplier and chain, the ring as a small
// map, the drift angle as an arc, the pedals, speed and gear. `makeHud({ T, ring })` builds it; `update(v)` once a frame with
// { dt, kmh, gear, throttle, brake, hand, beta (rad), x, z (scene axes), perf (a line of text) }; `reset()` after the car was put back.
// The page touches the DOM only when a shown value changes. Text goes in as text (no markup from data).
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const clock = (s) => { if (!(s >= 0) || !Number.isFinite(s)) return '–'; const m = Math.floor(s / 60), r = s - m * 60; return `${String(m).padStart(2, '0')}:${r.toFixed(3).padStart(6, '0').replace('.', ',')}`; };
const dots = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** The drift score as numbers (pure): points grow with speed and angle while the car slides, a chain raises the multiplier, a pause banks it. */
export function makeScore() { const S = { total: 0, run: 0, mult: 1, chain: 0, idle: 0, live: false };
  S.step = (dt, kmh, betaDeg) => { const a = Math.abs(betaDeg), sliding = a > 9 && a < 100 && kmh > 22; S.live = sliding;
    if (sliding) { S.idle = 0; S.chain += dt; S.mult = 1 + Math.min(4, Math.floor(S.chain / 0.6) * 0.2); S.run += kmh * (a / 30) * dt * 9 * S.mult; }
    else if (S.run > 0) { S.idle += dt; if (S.idle > 1.3) { S.total += S.run; S.run = 0; S.mult = 1; S.chain = 0; } }
    return S; };
  S.reset = () => { S.total = S.run = S.chain = S.idle = 0; S.mult = 1; S.live = false; }; return S; }

/** Laps round a ring (pure): the angle round the middle is added up; every full turn is a lap with its time. */
export function makeLaps(cx, cz) { const L = { lap: 1, time: 0, best: null, last: null, acc: 0, prev: null };
  L.step = (dt, x, z) => { const a = Math.atan2(z - cz, x - cx); if (L.prev !== null) { let d = a - L.prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; L.acc += d; } L.prev = a; L.time += dt;
    if (Math.abs(L.acc) >= 2 * Math.PI) { L.acc -= Math.sign(L.acc) * 2 * Math.PI; L.last = L.time; L.best = L.best === null ? L.time : Math.min(L.best, L.time); L.time = 0; L.lap++; } return L; };
  L.reset = () => { L.lap = 1; L.time = 0; L.acc = 0; L.prev = null; L.last = null; }; return L; }

export function makeHud({ T, ring }) {
  const root = el('div'); root.id = 'mhud'; root.setAttribute('aria-hidden', 'true'); const card = (id) => { const c = el('div', 'mc'); c.id = id; root.append(c); return c; };
  // lap and times
  const lap = card('mh-lap'), lapN = el('b', 'big', '1'), timeN = el('b', '', clock(0)), bestN = el('b', '', '–'); lap.append(el('span', '', T('lap')), lapN, el('span', '', T('time')), timeN, el('span', '', T('best')), bestN);
  // the drift score
  const sc = card('mh-score'), pts = el('span', 'pts', '0'), mult = el('span', 'mult', 'x1,0'), row = el('div', 'row'), chain = el('div', 'chain'), chainI = el('i'); row.append(pts, mult); chain.append(chainI); sc.append(el('small', '', T('score')), row, chain);
  // the ring as a map: the track as a band, the car as an arrow
  const map = card('mh-map'), R = ring.outer + 4, mid = (ring.inner + ring.outer) / 2, ms = svg('svg', { viewBox: `${-R} ${-R * 0.75} ${2 * R} ${1.5 * R}` });
  ms.append(svg('circle', { cx: 0, cy: 0, r: mid, fill: 'none', stroke: 'rgba(255,255,255,0.92)', 'stroke-width': (ring.outer - ring.inner) * 0.42, transform: 'scale(1 0.72)' }));
  const dot = svg('path', { d: 'M 0 -6 L 4.6 5 L 0 2.6 L -4.6 5 Z', fill: '#ff4f9e', stroke: '#fff', 'stroke-width': 0.9 }); ms.append(dot); map.append(ms);
  // the drift angle: an arc from 0 to 60 degrees, filled up to the angle, a marker at it
  const ang = el('div'); ang.id = 'mh-angle'; root.append(ang); const as = svg('svg', { viewBox: '0 0 230 96' }), A0 = Math.PI * 0.84, A1 = Math.PI * 0.16, RAD = 118, CX = 115, CY = 128, pt = (a) => [CX + RAD * Math.cos(a), CY - RAD * Math.sin(a)];
  const arcPath = (a, b) => { const [x0, y0] = pt(a), [x1, y1] = pt(b); return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${RAD} ${RAD} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; }, arcLen = RAD * (A0 - A1);
  as.append(svg('path', { d: arcPath(A0, A1), fill: 'none', stroke: 'rgba(40,16,60,0.55)', 'stroke-width': 13, 'stroke-linecap': 'round' }), svg('path', { d: arcPath(A0, A1), fill: 'none', stroke: 'rgba(255,255,255,0.85)', 'stroke-width': 9, 'stroke-linecap': 'round' }));
  const fill = svg('path', { d: arcPath(A0, A1), fill: 'none', stroke: '#ff4f9e', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-dasharray': `0 ${arcLen}` }), mark = svg('path', { d: 'M 0 -9 L 6 -19 L -6 -19 Z', fill: '#fff' }); as.append(fill, mark);
  const angV = el('div', 'val', '0°'); ang.append(as, el('div', 'lab', T('angle')), angV, el('div', 'end a', '0°'), el('div', 'end b', '60°'));
  // the pedals, the speed and the gear
  const ped = card('mh-pedals'), bars = {}; for (const [k, cls] of [['gas', 'gas'], ['brake', 'brk'], ['hand', 'hnd']]) { const p = el('div', `p ${cls}`), slot = el('div', 'slot'), i = el('i'); slot.append(i); p.append(slot, el('span', '', T(k === 'gas' ? 'pGas' : k === 'brake' ? 'pBrake' : 'pHand'))); ped.append(p); bars[k] = i; }
  const sp = card('mh-speed'), spN = el('div', 'n'), spV = document.createTextNode('0'), gear = el('div', 'g', 'N'); spN.append(spV, el('small', '', 'km/h')); sp.append(spN, gear);
  const perf = el('div'); perf.id = 'mh-perf'; root.append(perf);
  document.body.append(root); document.body.classList.add('mock-hud');
  const score = makeScore(), laps = makeLaps(ring.cx, ring.cz), shown = {}, set = (key, value, apply) => { if (shown[key] !== value) { shown[key] = value; apply(value); } };
  let px = null, pz = null, head = 0;
  return { score, laps, root,
    update(v) { const deg = (v.beta * 180) / Math.PI; score.step(v.dt, v.kmh, deg); laps.step(v.dt, v.x, v.z);
      set('lap', laps.lap, (n) => { lapN.textContent = String(n); }); set('time', Math.floor(laps.time * 20), () => { timeN.textContent = clock(laps.time); }); set('best', laps.best, (b) => { bestN.textContent = b === null ? '–' : clock(b); });
      set('pts', Math.round(score.total + score.run), (n) => { pts.textContent = dots(n); }); set('mult', score.mult.toFixed(1), (m) => { mult.textContent = `x${m.replace('.', ',')}`; }); set('live', score.live, (b) => sc.classList.toggle('live', b));
      set('chain', Math.round(Math.min(1, (score.chain % 0.6) / 0.6) * 50), (c) => { chainI.style.width = `${score.run > 0 ? c * 2 : 0}%`; });
      if (px !== null && Math.hypot(v.x - px, v.z - pz) > 0.02) head = Math.atan2(v.x - px, -(v.z - pz)); px = v.x; pz = v.z;
      set('dot', `${(v.x - ring.cx).toFixed(1)} ${((v.z - ring.cz) * 0.72).toFixed(1)} ${Math.round((head * 180) / Math.PI)}`, (p) => { const [x, z, r] = p.split(' '); dot.setAttribute('transform', `translate(${x} ${z}) rotate(${r})`); });
      const a = Math.min(60, Math.abs(deg) > 90 ? 180 - Math.abs(deg) : Math.abs(deg)), k = a / 60;
      set('ang', Math.round(a), (n) => { angV.textContent = `${n}°`; fill.setAttribute('stroke-dasharray', `${(arcLen * k).toFixed(1)} ${arcLen}`); const at = A0 + (A1 - A0) * k, [mx, my] = pt(at); mark.setAttribute('transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${(90 - (at * 180) / Math.PI).toFixed(1)})`); });
      set('gas', Math.round(v.throttle * 20), (n) => { bars.gas.style.height = `${n * 5}%`; }); set('brk', Math.round(v.brake * 20), (n) => { bars.brake.style.height = `${n * 5}%`; }); set('hnd', Math.round(v.hand * 20), (n) => { bars.hand.style.height = `${n * 5}%`; });
      set('kmh', Math.round(v.kmh), (n) => { spV.nodeValue = String(n); }); set('gear', v.gear, (g) => { gear.textContent = g; }); if (v.perf !== undefined) set('perf', v.perf, (p) => { perf.textContent = p; }); },
    reset() { score.reset(); laps.reset(); px = pz = null; } };
}
