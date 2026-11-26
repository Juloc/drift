// The engine model (sim/enginemodel.js) as a sound source in the browser: an AudioWorklet that computes the samples. The page sets the two parameters
// `rpm` and `throttle`; a message with option names and values changes the engine's voice while it runs (levels and chances; the pipes' lengths are fixed
// when it is made); the worklet tells the page when pops went off (for the flames at the tail pipe).
import { EngineModel } from '../sim/enginemodel.js';

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'rpm', defaultValue: 900, minValue: 0, maxValue: 12000, automationRate: 'k-rate' }, { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }]; }
  constructor(init) { super(); this.engine = new EngineModel(sampleRate, init?.processorOptions ?? {}); this.port.onmessage = (m) => { Object.assign(this.engine.o, m.data); if ('silencer' in m.data) this.engine.lowSil.k = m.data.silencer; }; }
  process(inputs, outputs, p) { const out = outputs[0][0]; if (!out) return true; this.engine.set(p.rpm[0], p.throttle[0]); const pops = this.engine.process(out); for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out); if (pops) this.port.postMessage({ pops }); return true; }
}
registerProcessor('engine', EngineProcessor);
