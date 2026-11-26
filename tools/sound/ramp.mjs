// Writes the engine ramp of a car (tools/sound/ramp.html, headless Chromium): docs/sound/<name>-ramp.png (spectrogram) and .wav.
// Usage: node tools/sound/ramp.mjs [car=1] [name=ae86]   (serves the repository itself on a free port)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const [car = '1', name = 'ae86'] = process.argv.slice(2);
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); res.end(fs.readFileSync(p)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/tools/sound/ramp.html?car=${car}`;
const { stdout: out } = await promisify(execFile)('node', [path.join(root, 'tools/pageeval.mjs'), url, 'window.__ramp', 'window.__ramp', '1400', '600'], { maxBuffer: 1 << 28 });   // async: the server above must keep answering
server.close();
const body = out.split('\nconsole:')[0];
const r = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
fs.mkdirSync(path.join(root, 'docs/sound'), { recursive: true });
fs.writeFileSync(path.join(root, `docs/sound/${name}-ramp.png`), Buffer.from(r.png, 'base64'));
fs.writeFileSync(path.join(root, `docs/sound/${name}-ramp.wav`), Buffer.from(r.wav, 'base64'));
console.log(`docs/sound/${name}-ramp.png and .wav (peak ${r.peak.toFixed(3)})`);
