// One monitored worker: estimator state, uncertainty, forecast, tier and daily ledger.
import { ectStep, ECT, psi, project, minutesToThreshold, restNeeded, newDay, addMinute } from './models.js';

export class Monitor {
  constructor({ id, name, task = '', acclimatised = true, hrRest = 70, conformal, fparams }) {
    Object.assign(this, { id, name, task, acclimatised, hrRest, conformal, fparams });
    this.state = { ct: ECT.CT0, v: 0 };
    this.hrHist = []; this.history = [];
    this.resting = false; this.restReason = null; this.restStarted = null;
    this.lastWater = null; this.tier = 'green'; this.day = null;
    this.out = { ct: ECT.CT0, upper: ECT.CT0 + 0.5, hr: null, psi: 0, mtt: null, restMin: 0, work: [], rest: [] };
  }
  get threshold() { return this.acclimatised ? 38.5 : 38.0; }

  // hr: 1-minute mean (or null); wx: { now, at(m, shade) } WBGT functions; t: ms UTC; dateKey for the ledger
  update(t, hr, wx, dateKey) {
    this.state = ectStep(this.state, hr);
    if (hr != null) { this.hrHist.push(hr); if (this.hrHist.length > 5) this.hrHist.shift(); }
    const hrNow = this.hrHist.length ? this.hrHist.reduce((a, b) => a + b, 0) / this.hrHist.length : 80;
    const ct = this.state.ct;
    const upper = this.conformal ? this.conformal.upper(ct) : ct + 0.5;
    const p = psi(ct, hrNow, 37.0, this.hrRest);
    const wNow = wx.at(0, this.resting);
    const work = project(this.state, hrNow, wx.at(0, false), (m) => wx.at(m, false), 60, 'work', this.fparams, this.conformal);
    const rest = project(this.state, hrNow, wx.at(0, true), (m) => wx.at(m, true), 60, 'rest', this.fparams, this.conformal);
    const mtt = upper >= this.threshold ? 0 : minutesToThreshold(work, this.threshold);
    const restMin = restNeeded(rest, this.threshold);

    let tier;
    if (this.resting) tier = upper < this.threshold - 0.3 && this.restReason !== 'break' ? 'cooled' : 'rest';
    else if (upper >= this.threshold || p >= 7 || (mtt != null && mtt <= 10)) tier = 'red';
    else if ((mtt != null && mtt <= 30) || upper >= this.threshold - 0.5) tier = 'amber';
    else tier = 'green';

    this.out = { ct, upper, hr: hrNow, psi: p, mtt, restMin, work, rest, wbgt: wNow };
    this.history.push({ t, ct, upper, hr: hrNow });
    if (this.history.length > 61) this.history.shift();

    if (!this.day || this.day.date !== dateKey) this.day = newDay(dateKey);
    addMinute(this.day, ct, p);

    const prev = this.tier;
    this.tier = tier === 'cooled' ? 'rest' : tier;
    return { prev, tier };
  }

  startRest(t, reason = 'manual') { this.resting = true; this.restReason = reason; this.restStarted = t; }
  endRest() { this.resting = false; this.restReason = null; this.restStarted = null; }
  drink(t) { this.lastWater = t; if (this.day) this.day.water += 1; }
}
