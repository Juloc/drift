// A page to hear and check the game's sound without WebGL (game/view/sound.js and music.js as the game uses them); window.__listen shows the state.
import { SoundSystem } from '../../game/view/sound.js';
const tracks = (await (await fetch('../../game/data/music.json')).json()).tracks;
const store = new Map([['drift.mute', '1']]), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const played = [];
const s = new SoundSystem({ storage, recorded: { 1: '../../game/assets/sound/ae86-engine.json' }, music: { tracks, base: '../../game/assets/music/', onTrack: (t) => played.push(t.id) } });
const $ = (id) => document.getElementById(id);
$('go').onclick = () => s.unlock();
$('music').onclick = () => { s.unlock(); s.setMusic(!s.music); };
$('unmute').onclick = () => s.setMuted(!s.muted);
$('next').onclick = () => { const d = s.player.decks[s.player.cur]; d.el.currentTime = Math.max(0, (d.track?.seconds ?? 10) - 7); };
setInterval(() => {
  const p = s.player;
  window.__listen = { ctx: s.ctx?.state, muted: s.muted, music: s.music, recorded: s.recordedFor(1), played, decks: p?.decks.map((d) => ({ id: d.track?.id, t: +d.el.currentTime.toFixed(1), dur: +(d.el.duration || 0).toFixed(1), gain: +d.g.gain.value.toFixed(2), paused: d.el.paused })) };
  $('out').textContent = JSON.stringify(window.__listen, null, 1);
}, 300);
