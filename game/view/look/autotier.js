// Picks the quality tier (high, medium, low) for the device: a first guess from what the browser tells about it (the graphics chip,
// memory, cores, a phone or not), then the frame rate of the first seconds decides (one step down when it is slow, one step up when it
// is easily fast), and then it stays (no flipping back and forth while driving). The player's own choice in the settings (high, medium,
// low) always wins over "auto". Pure logic: testable in node; `readDevice` is the only part that touches the browser.

export const TIERS = ['low', 'medium', 'high'];

/** What the browser tells about the device (WebGL's renderer string, memory in GB, logical cores, a touch phone). */
export function readDevice(renderer, nav = globalThis.navigator) {
  let gpu = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch { /* unknown */ }
  const mobile = !!(nav?.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(nav?.userAgent ?? ''));
  return { gpu, memory: nav?.deviceMemory ?? 0, cores: nav?.hardwareConcurrency ?? 0, mobile };
}

/** A first guess before anything is measured. */
export function guessTier({ gpu = '', memory = 0, cores = 0, mobile = false } = {}) {
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return 'low';   // no graphics chip at all
  if (mobile) {
    // phones: the strong ones (recent Apple chips, Adreno 7xx, Mali G7xx/Immortalis) get medium, the rest low
    if (/apple gpu|adreno.*(7\d\d|8\d\d)|immortalis|mali-g7\d|mali-g6[12]\d|xclipse/.test(g) || (memory >= 8 && cores >= 8)) return 'medium';
    return 'low';
  }
  if (/nvidia|geforce|rtx|radeon rx|radeon pro|apple m[1-9]|arc a/.test(g)) return 'high';
  if (/intel|uhd|iris|radeon\(tm\) graphics|vega/.test(g)) return memory && memory < 8 ? 'low' : 'medium';
  return memory >= 8 || cores >= 8 ? 'high' : 'medium';
}

/**
 * Measures the first seconds and settles. `sample(ms)` once per drawn frame; it returns a new tier when it decided to change, else null.
 * Settles after `window` seconds of frames (skipping the first `warm` seconds, when shaders compile), and once more after a change.
 */
export class TierPicker {
  constructor(start = 'medium', { warm = 1.5, window = 3, slow = 40, fast = 58, maxSteps = 2 } = {}) {
    Object.assign(this, { tier: start, warm, window, slow, fast, steps: 0, maxSteps, t: 0, n: 0, sum: 0, done: false, wentDown: false });
  }
  sample(ms) {
    if (this.done) return null;
    this.t += ms / 1000;
    if (this.t < this.warm) return null;
    this.n++; this.sum += ms;
    if (this.t < this.warm + this.window) return null;
    const fps = 1000 / (this.sum / this.n), i = TIERS.indexOf(this.tier);
    let next = null;
    if (fps < this.slow && i > 0) { next = TIERS[i - 1]; this.wentDown = true; }
    else if (fps > this.fast && i < TIERS.length - 1 && !this.wentDown) next = TIERS[i + 1];
    this.t = 0; this.n = 0; this.sum = 0;
    if (!next || ++this.steps > this.maxSteps) { this.done = true; return null; }
    this.tier = next;
    return next;
  }
}

/** The setting ("auto", "high", "medium", "low") and the device give the tier to start with; `auto` says whether to measure. */
export function startTier(setting, device) {
  if (TIERS.includes(setting)) return { tier: setting, auto: false };
  return { tier: guessTier(device), auto: true };
}
