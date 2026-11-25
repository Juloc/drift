// Load generator: N synthetic visitors (no browser) drive legal circles over a map on the relay for a while.
// Prints what each visitor received per second (near and far frames apart), whether everybody saw everybody, and what the relay spent (CPU, tick time).
// Needs the dev server: dotnet run --project server -- --port 8150 --stats --open-world [--interest 70|0] [--half 200,150]   (or --test-limits for the old small world)
// Usage: node tools/loadgen.mjs [visitors=16] [seconds=20] [port=8150] [halfX=113] [halfZ=78]
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { encodePose } from '../game/net/world.js';

const N = +(process.argv[2] ?? 16), SECS = +(process.argv[3] ?? 20), PORT = +(process.argv[4] ?? 8150);
const HX = +(process.argv[5] ?? 113), HZ = +(process.argv[6] ?? 78);
const pid = execSync(`pgrep -f "[D]riftServer.dll.*--port ${PORT}"`).toString().trim().split('\n').find((p) => !/bash|sh/.test(readFileSync(`/proc/${p}/comm`, 'utf8')));
const cpu = () => { const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (+f[11] + +f[12]) / 100; }; // utime + stime in seconds
const stats = async () => (await fetch(`http://127.0.0.1:${PORT}/relay-stats`)).json();
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const clients = [];
let up = 0;
for (let i = 0; i < N; i++) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?car=${i % 5}`);
  ws.binaryType = 'arraybuffer';
  const R = 15 + rnd() * 35, v = 12 + rnd() * 12;   // circles that fit the map, 12 to 24 m/s
  const c = { ws, i, open: false, seq: 0, down: 0, nearBytes: 0, farBytes: 0, snaps: 0, farFrames: 0, bye: null, seen: new Set(), id: null,
    R, v, cx: (rnd() * 2 - 1) * Math.max(0, HX - 8 - R), cz: (rnd() * 2 - 1) * Math.max(0, HZ - 8 - R), a0: rnd() * 6.28 };
  ws.onopen = () => (c.open = true);
  ws.onmessage = (e) => {
    const dv = new DataView(e.data), t = dv.getUint8(0), len = e.data.byteLength + 2;
    c.down += len;
    if (t === 0x80) c.id = dv.getUint8(1);
    if (t === 0x82) { c.snaps++; c.nearBytes += len; for (let k = 0; k < dv.getUint8(1); k++) c.seen.add(dv.getUint8(4 + k * 12)); }
    if (t === 0x86) { c.farFrames++; c.farBytes += len; for (let k = 0; k < dv.getUint8(1); k++) c.seen.add(dv.getUint8(4 + k * 7)); }
    if (t === 0x84) c.bye = dv.getUint8(1);
  };
  clients.push(c);
  await new Promise((r) => setTimeout(r, 25));
}
await new Promise((r) => setTimeout(r, 500));
const cpu0 = cpu(), s0 = await stats(), t0 = Date.now();
const timer = setInterval(() => {
  const t = (Date.now() - t0) / 1000;
  for (const c of clients) {
    if (!c.open || c.ws.readyState !== 1) continue;
    const a = c.a0 + (t * c.v) / c.R;
    c.ws.send(encodePose(c.seq++, { x: c.cx + c.R * Math.cos(a), z: c.cz + c.R * Math.sin(a), h: (Math.atan2(-Math.sin(a), Math.cos(a)) + 6.2832) % 6.2832, vf: c.v, steer: 0.2 }, 0.2, 2));
    up += 13 + 6;
  }
}, 1000 / 15);
await new Promise((r) => setTimeout(r, SECS * 1000));
clearInterval(timer);
const dt = (Date.now() - t0) / 1000, cpu1 = cpu(), s1 = await stats();
const sum = (k) => clients.reduce((a, c) => a + c[k], 0);
const everybody = clients.filter((c) => c.seen.size >= clients.length - 1).length;
console.log(JSON.stringify({
  visitors: N, worlds: s1.worlds, seconds: +dt.toFixed(1),
  uploadBytesPerSecondPerVisitor: Math.round(up / N / dt),
  downloadBytesPerSecondPerVisitor: Math.round(sum('down') / N / dt),
  ofWhichNearFrames: Math.round(sum('nearBytes') / N / dt), ofWhichFarFrames: Math.round(sum('farBytes') / N / dt),
  snapshotsPerSecondPerVisitor: +(sum('snaps') / N / dt).toFixed(1), farFramesPerSecondPerVisitor: +(sum('farFrames') / N / dt).toFixed(1),
  visitorsWhoSawEverybodyAtLeastOnce: everybody,
  relayCpuPercentOfOneCore: +(((cpu1 - cpu0) / dt) * 100).toFixed(1),
  relayTickMicrosecondsAverage: Math.round(s1.tickMicroseconds), relayTickMicrosecondsMax: Math.round(s1.maxTickMicroseconds),
  accepted: s1.accepted - s0.accepted, rejected: s1.rejected - s0.rejected,
  kicked: clients.filter((c) => c.bye !== null).length,
}, null, 1));
for (const c of clients) c.ws.close();
setTimeout(() => process.exit(0), 300);
