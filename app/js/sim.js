// Demo-only physiology simulator. It generates a plausible "true" core temperature
// from workload and site heat, then a heart rate from it. Because heart rate is made
// with the same relation the estimator inverts, estimator accuracy in demo mode is
// optimistic: report accuracy only from research/results (real data).
import { hrFromCt } from './models.js';

export function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { const u = Math.max(r(), 1e-9), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export const LEVELS = {
  rest: { label: 'Rest', gain: 0, bump: 0 },
  light: { label: 'Light work', gain: 0.012, bump: 4 },
  moderate: { label: 'Moderate work', gain: 0.022, bump: 8 },
  heavy: { label: 'Heavy work', gain: 0.032, bump: 12 },
};

export class SimBody {
  constructor({ seed = 1, fitness = 0, acclimatised = true, hrOffset = 0 } = {}) {
    this.r = rng(seed); this.fitness = fitness; this.acclimatised = acclimatised; this.hrOffset = hrOffset;
    this.ct = 36.95 + 0.1 * gauss(this.r);
  }
  minute(level, wbgt, resting) {
    const L = LEVELS[resting ? 'rest' : level];
    const g = L.gain * (1 + Math.max(-0.5, 0.07 * (wbgt - 27))) * (this.acclimatised ? 0.85 : 1.05) * (1 - 0.1 * this.fitness);
    const K = resting ? 0.03 : 0.012;
    const c = K * (this.ct - 36.9) * (1 - Math.max(0, wbgt - 24) * 0.02);
    this.ct += g - c + 0.004 * gauss(this.r);
    const hr = hrFromCt(this.ct) + this.hrOffset + L.bump + 3 * gauss(this.r);
    return Math.max(50, Math.min(200, hr));
  }
}

export const CREW = [
  { id: 'w1', name: 'Rahim', task: 'Rebar fixing', level: 'heavy', fitness: 0.3, acclimatised: true, hrOffset: -2 },
  { id: 'w2', name: 'Sujan', task: 'Concrete pour', level: 'heavy', fitness: 0.0, acclimatised: true, hrOffset: 3 },
  { id: 'w3', name: 'Bikash', task: 'Steel cutting (arrived 3 days ago)', level: 'heavy', fitness: -0.2, acclimatised: false, hrOffset: 5 },
  { id: 'w4', name: 'Arif', task: 'Scaffolding', level: 'moderate', fitness: 0.5, acclimatised: true, hrOffset: -4 },
  { id: 'w5', name: 'Imran', task: 'Formwork', level: 'moderate', fitness: 0.1, acclimatised: true, hrOffset: 0 },
  { id: 'w6', name: 'Kamal', task: 'Plastering', level: 'moderate', fitness: -0.4, acclimatised: true, hrOffset: 4 },
  { id: 'w7', name: 'Ramesh', task: 'Site cleaning', level: 'light', fitness: 0.0, acclimatised: true, hrOffset: 1 },
  { id: 'w8', name: 'Faisal', task: 'Surveying', level: 'light', fitness: 0.6, acclimatised: true, hrOffset: -3 },
];
