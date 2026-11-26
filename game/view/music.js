// Music in the game (game/data/music.json, the files in game/assets/music/): the tracks one after the other in a shuffled order, each faded into the next over
// a few seconds (two audio elements take turns, so there is never a silence between tracks), streamed (an element decodes as it plays: three minutes of music
// decoded at once would take 70 MB on a phone). Its own volume; it goes through the page's audio context, so the sound switch silences it as well. Nothing
// plays before the player switches music on (off by default, kept on the device by game/view/sound.js).
const FADE = 4;   // seconds of crossfade between tracks

export class MusicPlayer {
  /** @param {{ ctx: AudioContext, out: AudioNode, tracks: { id, file, title, author }[], base?: string, first?: string, onTrack?: (track) => void }} o */
  constructor({ ctx, out, tracks, base = 'assets/music/', first = null, onTrack = null }) {
    Object.assign(this, { ctx, tracks, base, onTrack });
    this.gain = ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(out);   // on/off and the volume
    this.decks = [0, 1].map(() => {
      const el = new Audio(); el.preload = 'auto'; el.crossOrigin = 'anonymous';
      const g = ctx.createGain(); g.gain.value = 0; ctx.createMediaElementSource(el).connect(g); g.connect(this.gain);
      return { el, g, track: null };
    });
    // the order: shuffled, the map's own track first when it has one
    this.order = tracks.map((t) => t.id).sort(() => Math.random() - 0.5);
    if (first && this.order.includes(first)) this.order = [first, ...this.order.filter((x) => x !== first)];
    this.next = 0; this.cur = 0; this.on = false; this.volume = 0.5;
    this.timer = setInterval(() => this.tick(), 250);
  }
  /** The track after the current one (round and round). */
  take() { const t = this.tracks.find((x) => x.id === this.order[this.next % this.order.length]); this.next++; return t; }
  start(deck, track, fadeIn) {
    const t = this.ctx.currentTime;
    deck.track = track; deck.el.src = this.base + track.file; deck.el.currentTime = 0;
    deck.el.play()?.catch?.(() => {});
    deck.g.gain.cancelScheduledValues?.(t); deck.g.gain.setValueAtTime(fadeIn ? 0 : 1, t); if (fadeIn) deck.g.gain.linearRampToValueAtTime(1, t + FADE);
    this.onTrack?.(track);
  }
  /** Near the end of a track the other deck starts the next one and the two cross over. */
  tick() {
    if (!this.on) return;
    const a = this.decks[this.cur], dur = Number.isFinite(a.el.duration) && a.el.duration > 0 ? a.el.duration : a.track?.seconds ?? Infinity, left = dur - a.el.currentTime;   // (a server without range requests: the browser may not know an Ogg file's length; music.json does)
    if (a.track && (left < FADE + 0.3 || a.el.ended)) {
      const t = this.ctx.currentTime, b = this.decks[1 - this.cur];
      a.g.gain.cancelScheduledValues?.(t); a.g.gain.setValueAtTime(a.g.gain.value, t); a.g.gain.linearRampToValueAtTime(0, t + FADE);
      setTimeout(() => { if (this.decks[1 - this.cur] === a) a.el.pause(); }, (FADE + 0.5) * 1000);
      this.start(b, this.take(), true);
      this.cur = 1 - this.cur;
    }
  }
  /** Switches the music on or off (a soft fade either way). */
  setOn(on) {
    const t = this.ctx.currentTime;
    this.on = !!on;
    this.gain.gain.cancelScheduledValues?.(t); this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    if (this.on) {
      const a = this.decks[this.cur];
      if (!a.track) this.start(a, this.take(), false); else a.el.play()?.catch?.(() => {});
      this.gain.gain.linearRampToValueAtTime(this.volume, t + 1.5);
    } else {
      this.gain.gain.linearRampToValueAtTime(0, t + 0.8);
      setTimeout(() => { if (!this.on) for (const d of this.decks) d.el.pause(); }, 900);
    }
  }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, +v || 0));
    if (this.on) { const t = this.ctx.currentTime; this.gain.gain.cancelScheduledValues?.(t); this.gain.gain.setTargetAtTime(this.volume, t, 0.1); }
  }
  /** What plays now (for the credits line): the track or null. */
  get playing() { return this.on ? this.decks[this.cur].track : null; }
  dispose() { clearInterval(this.timer); for (const d of this.decks) { d.el.pause(); d.el.src = ''; } }
}
