// Quality tiers and the automatic governor that picks one from the measured frame time.

export const TIERS = {
  high: { dpr: 1.75, scale: 1, shadows: 2048, samples: 4, blur: true, grain: true },
  medium: { dpr: 1.25, scale: 1, shadows: 1024, samples: 0, blur: true, grain: true },
  low: { dpr: 1, scale: 0.7, shadows: 0, samples: 0, blur: false, grain: false },
};
export const ORDER = ['low', 'medium', 'high'];

export class Governor {
  /** @param {(tier:string)=>void} apply */
  constructor(apply, start = 'medium') {
    this.apply = apply;
    this.auto = true;
    this.tier = start;
    this.avg = 16;
    this.frames = 0;
    this.slow = 0;
    this.fast = 0;
    this.wentDown = false;
    this.settle = 30;
  }

  set(tier, auto = false) {
    this.auto = auto;
    if (tier !== this.tier) {
      this.tier = tier;
      this.apply(tier);
    }
    this.settle = 30;
    this.slow = this.fast = 0;
  }

  /** Call once per rendered frame with the frame time in milliseconds. */
  sample(ms) {
    this.avg += (Math.min(ms, 250) - this.avg) * 0.08;
    if (!this.auto) return;
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    const i = ORDER.indexOf(this.tier);
    if (this.avg > 36) {
      this.fast = 0;
      if (++this.slow > 45 && i > 0) {
        this.wentDown = true;
        this.set(ORDER[i - 1], true);
      }
    } else if (this.avg < 11.5) {
      this.slow = 0;
      // climb only if we never had to step down: avoids flipping back and forth
      if (++this.fast > 240 && i < ORDER.length - 1 && !this.wentDown) this.set(ORDER[i + 1], true);
    } else {
      this.slow = Math.max(0, this.slow - 1);
      this.fast = 0;
    }
  }
}
