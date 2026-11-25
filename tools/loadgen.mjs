// Load generator: N synthetic visitors (no browser) drive circles on the relay for a while.
// Prints what each visitor received per second and what the relay spent (CPU of its process, tick time).
// Usage: node tools/loadgen.mjs [visitors=16] [seconds=20] [port=8150]
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { encodePose } from '../game/net/world.js';

const N = +(process.argv[2] ?? 16), SECS = +(process.argv[3] ?? 20), PORT = +(process.argv[4] ?? 8150);
const pid = execSync(`pgrep -f "[D]riftServer.dll.*--port ${PORT}"`).toString().trim().split('\n').find((p) => !/bash|sh/.test(readFileSync(`/proc/${p}/comm`, 'utf8')));
const cpu = () => { const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (+f[11] + +f[12]) / 100; }; // utime + stime in seconds
const stats = async () => (await fetch(`http://127.0.0.1:${PORT}/relay-stats`)).json();
const clients = [];
let up = 0, down = 0, frames = 0;
for (let i = 0; i < N; i++) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?car=${i % 5}`);
  ws.binaryType = 'arraybuffer';
  const c = { ws, i, open: false, seq: 0, down: 0, snaps: 0, bye: null };
  ws.onopen = () => (c.open = true);
  ws.onmessage = (e) => { c.down += e.data.byteLength + 2; const t = new DataView(e.data).getUint8(0); if (t === 0x82) c.snaps++; if (t === 0x84) c.bye = new DataView(e.data).getUint8(1); };
  clients.push(c);
  await new Promise((r) => setTimeout(r, 40));
}
await new Promise((r) => setTimeout(r, 500));
const cpu0 = cpu(), s0 = await stats(), t0 = Date.now();
const timer = setInterval(() => {
  const t = (Date.now() - t0) / 1000;
  for (const c of clients) {
    if (!c.open || c.ws.readyState !== 1) continue;
    const a = t * 0.6 + c.i, R = 20 + c.i * 2; // circles of different size, about 12-35 m/s
    const sp = 0.6 * R;
    c.ws.send(encodePose(c.seq++, { x: R * Math.cos(a), z: R * Math.sin(a) * 0.8, h: (Math.PI / 2 - a + 6.28) % 6.28, vf: Math.min(sp, 30), steer: 0.2 }, 0.2, 2));
    up += 13 + 6; frames++;
  }
}, 1000 / 15);
await new Promise((r) => setTimeout(r, SECS * 1000));
clearInterval(timer);
const dt = (Date.now() - t0) / 1000, cpu1 = cpu(), s1 = await stats();
const down0 = clients.reduce((a, c) => a + c.down, 0), snaps = clients.reduce((a, c) => a + c.snaps, 0);
console.log(JSON.stringify({
  visitors: N, worlds: s1.worlds, seconds: +dt.toFixed(1),
  uploadBytesPerSecondPerVisitor: Math.round(up / N / dt),
  downloadBytesPerSecondPerVisitor_includingRosterAndJoin: Math.round(down0 / N / dt),
  snapshotsPerSecondPerVisitor: +(snaps / N / dt).toFixed(1),
  relayCpuPercentOfOneCore: +(((cpu1 - cpu0) / dt) * 100).toFixed(1),
  relayTickMicrosecondsAverage: Math.round(s1.tickMicroseconds),
  accepted: s1.accepted - s0.accepted, rejected: s1.rejected - s0.rejected,
  kicked: clients.filter((c) => c.bye !== null).length,
}, null, 1));
for (const c of clients) c.ws.close();
setTimeout(() => process.exit(0), 300);
