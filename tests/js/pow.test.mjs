// The sign-up page's proof of work (src/Drift/wwwroot/games/pow.js) finds numbers that the server's check (SHA-256 of "salt:name:number") accepts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { solve } from '../../src/Drift/wwwroot/games/pow.js';

const bitsOf = (salt, name, n) => { const h = createHash('sha256').update(`${salt}:${name}:${n}`, 'utf8').digest(); let b = 0; for (const byte of h) { if (byte === 0) { b += 8; continue; } b += Math.clz32(byte) - 24; break; } return b; };

for (const name of ['Kiwi 7', 'Müller 12', 'a.b-c_d', 'Ünïcödé Ünïcödé']) {
  test(`the worker's number for "${name}" has the zero bits the server checks`, () => {
    const salt = 'AbCdEfGh123';
    for (const bits of [1, 8, 14]) assert.ok(bitsOf(salt, name, solve(salt, name, bits)) >= bits);
  });
}

test('speed: the base level (17 bits) is solved in a count of tries a phone can do in about a second', () => {
  const t0 = performance.now(); let tries = 0;
  for (let i = 0; i < 8; i++) { const n = +solve('Salt' + i + 'xyz', 'Speed Test', 17); tries += n + 1; }
  const ms = performance.now() - t0, perSecond = tries / (ms / 1000);
  console.log(`17 bits: ${(tries / 8).toFixed(0)} tries on average, ${(perSecond / 1000).toFixed(0)}k hashes per second here`);
  assert.ok(perSecond > 50_000, `only ${perSecond.toFixed(0)} hashes per second`);
});
