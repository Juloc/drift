// Makes throwaway accounts on a LOCAL development instance and prints their session cookies (for trying the app in a
// headless browser). The first name becomes the administrator through the setup assistant, the others are invited by it.
// Usage: node tools/dev-people.mjs <base url, e.g. http://127.0.0.1:8180> <setup code> <name> [<name> ...]
// Nothing here is a real account: the password is a throwaway value for localhost.
import { createHmac } from 'node:crypto';

const [base, code, ...names] = process.argv.slice(2);
if (!base || !code || !names.length) { console.error('usage: dev-people.mjs <url> <setup code> <name>...'); process.exit(1); }
const PASSWORD = 'correct horse battery';
const post = async (path, body, cookie) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Base': '1', Origin: new URL(base).origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return { json: r.status === 204 ? null : await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const b32 = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '', out = []; for (const c of s.replace(/=+$/, '')) bits += A.indexOf(c).toString(2).padStart(5, '0'); for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const totp = (secret) => { const c = Buffer.alloc(8); c.writeBigInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(c).digest(); const o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };

const out = {};
const [admin, ...others] = names;
const begin = await post('/api/setup/begin', { code, user: admin, password: PASSWORD });
const fin = await post('/api/setup/finish', { code, user: admin, totp: totp(begin.json.secret) });
out[admin] = fin.cookie;
for (const name of others) {
  const made = await post('/api/people', { name, role: 'member' }, fin.cookie);
  const token = made.json.invite.token;
  const b = await post('/api/invite/begin', { token, password: PASSWORD });
  const f = await post('/api/invite/finish', { token, totp: totp(b.json.secret) });
  out[name] = f.cookie;
}
console.log(JSON.stringify(out, null, 1));
