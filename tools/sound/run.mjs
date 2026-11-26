// Runs a job of tools/sound/work.js in headless Chromium (decoding, measuring, cutting and encoding sound needs the browser's own decoders and its Opus encoder):
// serves the repository and, under /src/, a folder of source recordings (outside the repository: the downloads); writes the files the job returns into the repository.
// Usage: node tools/sound/run.mjs <job> <source folder> [query, e.g. 'file=f20c/2002-Honda-F20C.ogg']   Prints the job's summary as JSON.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const [job, srcDir, query = ''] = process.argv.slice(2);
if (!job || !srcDir) { console.error('usage: node tools/sound/run.mjs <job> <source folder> [query]'); process.exit(2); }
const root = path.resolve(new URL('../..', import.meta.url).pathname), src = path.resolve(srcDir);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), [base, rel] = u.startsWith('/src/') ? [src, u.slice(5)] : [root, u];
  const p = path.join(base, rel);
  if (!p.startsWith(base) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/tools/sound/work.html?job=${job}&${query}`;
const { stdout } = await promisify(execFile)('node', [path.join(root, 'tools/pageeval.mjs'), url, 'window.__out', 'JSON.stringify(window.__out)', '1400', '700'], { maxBuffer: 1 << 30 });
server.close();
const body = stdout.split('\nconsole:')[0], logs = stdout.split('\nconsole:')[1];
let r;
try { r = JSON.parse(JSON.parse(body.slice(body.indexOf('"'), body.lastIndexOf('"') + 1))); } catch { console.error('no result', body.slice(0, 500), logs ?? ''); process.exit(1); }
for (const f of r.files ?? []) { const to = path.join(root, f.path); if (!to.startsWith(root)) throw new Error('outside the repository: ' + f.path); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, Buffer.from(f.b64, 'base64')); }
console.log(JSON.stringify({ ...r, files: (r.files ?? []).map((f) => `${f.path} (${Math.round(Buffer.from(f.b64, 'base64').length / 1024)} KB)`) }));
if (r.error) process.exit(1);
