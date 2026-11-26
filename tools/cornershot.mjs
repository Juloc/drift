// A still picture of a page with headless Chromium (the machine's graphics when there are any). Usage: node tools/cornershot.mjs <url> <file.png> [width] [height] [ms]
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { GL_FLAGS } from './chrome.mjs';
const [url, file, w = '1280', h = '720', ms = '14000'] = process.argv.slice(2);
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const r = spawnSync(chrome, ['--headless=new', '--no-sandbox', ...GL_FLAGS, '--hide-scrollbars', `--window-size=${w},${h}`, `--virtual-time-budget=${ms}`, `--screenshot=${file}`, `--user-data-dir=/tmp/claude-1000/cornershot-${process.pid}`, url], { encoding: 'utf8', timeout: 120000 });
console.log(r.status === 0 ? `wrote ${file}` : `failed: ${(r.stderr || '').slice(-400)}`);
