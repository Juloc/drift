// A static server for the repository that answers with the app's own security headers (the content policy of base/src/Base.Web/SecurityHeaders.cs, read from that file, so there is one
// source). The checking tools use it instead of a plain file server: a page that needs something the policy forbids (the glTF loader's fetch of a blob: address under connect-src 'self',
// an inline script, a foreign origin) fails here as it fails in the app. 0.7.18 showed black models when live because no local check ran under that policy.
// Usage: const web = await serveRepo(); web.port; web.close(). `DRIFT_PLAIN_SERVER=1` serves without the policy (to compare).
import { createServer } from 'node:http';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const src = readFileSync(join(ROOT, 'base/src/Base.Web/SecurityHeaders.cs'), 'utf8');
const csp = [...src.matchAll(/Csp\s*=\s*((?:"[^"]*"\s*\+?\s*)+);/g)][0]?.[1].match(/"([^"]*)"/g).map((s) => s.slice(1, -1)).join('') ?? '';
if (!csp.includes("connect-src 'self'")) throw new Error('the content policy could not be read from SecurityHeaders.cs');
export const CSP = csp;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
export function serveRepo({ port = 21000 + Math.floor(Math.random() * 3000), plain = process.env.DRIFT_PLAIN_SERVER === '1' } = {}) {
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    let st; try { st = statSync(file); } catch { res.writeHead(404).end('not found'); return; }
    if (st.isDirectory()) { res.writeHead(404).end(); return; }
    const h = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' };
    if (!plain) Object.assign(h, { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin' });
    res.writeHead(200, h); createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ port, close: () => server.close() })));
}
