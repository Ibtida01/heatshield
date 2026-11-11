// HeatShield models — JavaScript ports of research/heatshield/*.py.
// Keep in sync with the Python package; tests/parity.mjs checks they agree.

// ---------------------------------------------------------------- ECTemp (Buller et al. 2013)
export const ECT = { A: 1.0, GAMMA: 0.022, B0: -7887.1, B1: 384.4286, B2: -4.5714, SIGMA: 18.88, CT0: 37.1 };

export function hrFromCt(ct) { return ECT.B2 * ct * ct + ECT.B1 * ct + ECT.B0; }

export function ctFromHr(hr) {
  const disc = Math.max(ECT.B1 * ECT.B1 - 4 * ECT.B2 * (ECT.B0 - hr), 0);
  return (-ECT.B1 + Math.sqrt(disc)) / (2 * ECT.B2);
}

export function ectStep(state, hr) {
  const ctPred = ECT.A * state.ct;
  const vPred = ECT.A * state.v * ECT.A + ECT.GAMMA * ECT.GAMMA;
  if (hr == null || !Number.isFinite(hr)) return { ct: ctPred, v: vPred };
  const c = 2 * ECT.B2 * ctPred + ECT.B1;
  const k = (vPred * c) / (c * c * vPred + ECT.SIGMA * ECT.SIGMA);
  return { ct: ctPred + k * (hr - hrFromCt(ctPred)), v: (1 - k * c) * vPred };
}

// ---------------------------------------------------------------- Solar position (NOAA)
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;

export function solarPosition(dateUtc, lat, lon) {
  const jd = dateUtc.getTime() / 86400000 + 2440587.5;
  const jc = (jd - 2451545) / 36525;
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C = Math.sin(rad(M)) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
    + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * jc) + Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + C, trueAnom = M + C;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(rad(trueAnom)));
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const meanObliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(appLong))));
  const y = Math.tan(rad(obliq / 2)) ** 2;
  const eqTime = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M))
    + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
    - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  const minutes = dateUtc.getUTCHours() * 60 + dateUtc.getUTCMinutes() + dateUtc.getUTCSeconds() / 60;
  const tst = ((minutes + eqTime + 4 * lon) % 1440 + 1440) % 1440;
  const ha = tst / 4 - 180;
  let cz = Math.sin(rad(lat)) * Math.sin(rad(decl)) + Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(ha));
  cz = Math.max(-1, Math.min(1, cz));
  const zen = deg(Math.acos(cz));
  const denom = Math.cos(rad(lat)) * Math.sin(rad(zen));
  let az;
  if (Math.abs(denom) < 1e-9) az = lat > decl ? 180 : 0;
  else {
    const x = Math.max(-1, Math.min(1, (Math.sin(rad(lat)) * Math.cos(rad(zen)) - Math.sin(rad(decl))) / denom));
    az = ha > 0 ? (deg(Math.acos(x)) + 180) % 360 : (540 - deg(Math.acos(x))) % 360;
  }
  return { zenith: zen, azimuth: az, R, cza: cz };
}

// ---------------------------------------------------------------- WBGT (Liljegren et al. 2008)
const W = {
  STEFANB: 5.6696e-8, CP: 1003.5, M_AIR: 28.97, M_H2O: 18.015, R_GAS: 8314.34,
  EMIS_WICK: 0.95, ALB_WICK: 0.4, D_WICK: 0.007, L_WICK: 0.0254,
  EMIS_GLOBE: 0.95, ALB_GLOBE: 0.05, D_GLOBE: 0.0508, EMIS_SFC: 0.999, ALB_SFC: 0.45,
  CZA_MIN: 0.00873, MIN_SPEED: 0.13, CONVERGENCE: 0.02, MAX_ITER: 500, SOLAR_CONST: 1367, NORMSOLAR_MAX: 0.85,
};
W.RATIO = (W.CP * W.M_AIR) / W.M_H2O; W.R_AIR = W.R_GAS / W.M_AIR; W.PR = W.CP / (W.CP + 1.25 * W.R_AIR);

export function esat(tk) { const y = (tk - 273.15) / (tk - 32.18); return 1.004 * 6.1121 * Math.exp(17.502 * y); }
function dewPointK(e) { const z = Math.log(e / (6.1121 * 1.004)); return 273.15 + (240.97 * z) / (17.502 - z); }
function viscosity(tk) { const omega = ((tk / 97 - 2.9) / 0.4) * -0.034 + 1.048; return (2.6693e-6 * Math.sqrt(W.M_AIR * tk)) / (3.617 * 3.617 * omega); }
function thermalCond(tk) { return (W.CP + 1.25 * W.R_AIR) * viscosity(tk); }
function diffusivity(tk, p) {
  const pcrit13 = Math.pow(36.4 * 218, 1 / 3), tcrit512 = Math.pow(132 * 647.3, 5 / 12);
  const tcrit12 = Math.sqrt(132 * 647.3), mmix = Math.sqrt(1 / W.M_AIR + 1 / W.M_H2O);
  return 3.64e-4 * Math.pow(tk / tcrit12, 2.334) * pcrit13 * tcrit512 * mmix / (p / 1013.25) * 1e-4;
}
function evap(tk) { return ((313.15 - tk) / 30) * -71100 + 2.4073e6; }
function emisAtm(tk, rh) { return 0.575 * Math.pow(rh * esat(tk), 0.143); }
function hSphere(tk, p, u) {
  const dens = (p * 100) / (W.R_AIR * tk), re = (Math.max(u, W.MIN_SPEED) * dens * W.D_GLOBE) / viscosity(tk);
  return ((2 + 0.6 * Math.sqrt(re) * Math.pow(W.PR, 0.3333)) * thermalCond(tk)) / W.D_GLOBE;
}
function hCylinder(tk, p, u) {
  const dens = (p * 100) / (W.R_AIR * tk), re = (Math.max(u, W.MIN_SPEED) * dens * W.D_WICK) / viscosity(tk);
  return (0.281 * Math.pow(re, 0.6) * Math.pow(W.PR, 0.44) * thermalCond(tk)) / W.D_WICK;
}
function globeK(tk, rh, p, u, solar, fdir, cza) {
  let prev = tk, tg = tk;
  for (let i = 0; i < W.MAX_ITER; i++) {
    const h = hSphere(0.5 * (prev + tk), p, u);
    let radTerm = 0;
    if (solar > 0) radTerm = (solar / (2 * W.STEFANB * W.EMIS_GLOBE)) * (1 - W.ALB_GLOBE)
      * (cza > W.CZA_MIN ? fdir * (1 / (2 * cza) - 1) + 1 + W.ALB_SFC : 1 + W.ALB_SFC);
    const val = 0.5 * (emisAtm(tk, rh) * tk ** 4 + W.EMIS_SFC * tk ** 4) - (h / (W.STEFANB * W.EMIS_GLOBE)) * (prev - tk) + radTerm;
    tg = Math.pow(Math.max(val, 1), 0.25);
    if (Math.abs(tg - prev) < W.CONVERGENCE) return tg;
    prev = 0.9 * prev + 0.1 * tg;
  }
  return prev;
}
function nwbK(tk, rh, p, u, solar, fdir, cza) {
  const eair = rh * esat(tk);
  let prev = dewPointK(eair), twb = prev;
  const sza = Math.acos(Math.max(Math.min(cza, 1), -1));
  const tanTerm = cza > W.CZA_MIN ? Math.tan(sza) / Math.PI : 0;
  for (let i = 0; i < W.MAX_ITER; i++) {
    const tref = 0.5 * (prev + tk), h = hCylinder(tref, p, u);
    const fatm = W.STEFANB * W.EMIS_WICK * (0.5 * (emisAtm(tk, rh) * tk ** 4 + W.EMIS_SFC * tk ** 4) - prev ** 4)
      + (1 - W.ALB_WICK) * solar * ((1 - fdir) * (1 + (0.25 * W.D_WICK) / W.L_WICK) + fdir * (tanTerm + (0.25 * W.D_WICK) / W.L_WICK) + W.ALB_SFC);
    const ewick = esat(prev), dens = (p * 100) / (W.R_AIR * tref);
    const sc = viscosity(tref) / (dens * diffusivity(tref, p));
    twb = tk - (evap(tref) / W.RATIO) * ((ewick - eair) / (p - ewick)) * Math.pow(W.PR / sc, 0.56) + fatm / h;
    if (Math.abs(twb - prev) < W.CONVERGENCE) return twb;
    prev = 0.9 * prev + 0.1 * twb;
  }
  return prev;
}
export function estimateFdir(solar, cza, R = 1) {
  const toa = (W.SOLAR_CONST * Math.max(0, cza)) / (R * R);
  if (cza < W.CZA_MIN || toa <= 0) return [0, 0];
  const norm = Math.min(solar / toa, W.NORMSOLAR_MAX);
  if (norm <= 0) return [norm * toa, 0];
  return [norm * toa, Math.max(Math.min(Math.exp(3 - 1.34 * norm - 1.65 / norm), 0.9), 0)];
}
export function wbgtOutdoor({ tC, rhPct, pHpa, wind, solar, fdir = null, cza, urban = true, windHeight = 10, R = 1 }) {
  const tk = tC + 273.15, rh = Math.max(Math.min(rhPct / 100, 1), 0.01);
  const u = windHeight === 2 ? Math.max(wind, W.MIN_SPEED) : Math.max(wind * Math.pow(2 / windHeight, urban ? 0.25 : 0.15), W.MIN_SPEED);
  let s = Math.max(solar, 0), f = fdir;
  if (f == null) [s, f] = estimateFdir(s, cza, R);
  f = Math.max(Math.min(f, 0.9), 0);
  if (cza <= W.CZA_MIN) f = 0;
  const tg = globeK(tk, rh, pHpa, u, s, f, cza) - 273.15;
  const tnwb = nwbK(tk, rh, pHpa, u, s, f, cza) - 273.15;
  return { wbgt: 0.7 * tnwb + 0.2 * tg + 0.1 * tC, globe: tg, nwb: tnwb };
}

// US Army TB MED 507 heat categories (WBGT, deg C)
export function heatCategory(w) {
  if (w >= 32.2) return 5; if (w >= 31.1) return 4; if (w >= 29.4) return 3; if (w >= 27.8) return 2; if (w >= 25.6) return 1; return 0;
}

// ---------------------------------------------------------------- PSI (Moran et al. 1998)
export function psi(tc, hr, tc0 = 37.0, hr0 = 70) {
  return Math.max(0, Math.min(10, (5 * (tc - tc0)) / (39.5 - tc0) + (5 * (hr - hr0)) / (180 - hr0)));
}

// ---------------------------------------------------------------- Conformal upper bound
export class Conformal {
  constructor(cfg) {
    this.cfg = cfg;
    this.edges = cfg.edges.map((e, i) => (e == null ? (i === 0 ? -Infinity : Infinity) : e));
  }
  bin(ct) { for (let i = 0; i < this.edges.length - 1; i++) if (ct >= this.edges[i] && ct < this.edges[i + 1]) return i; return this.edges.length - 2; }
  upper(ct) { return ct + this.cfg.q_upper[this.bin(ct)]; }
  interval(ct) { const i = this.bin(ct); return [ct + this.cfg.q_lo[i], ct + this.cfg.q_hi[i]]; }
}

// ---------------------------------------------------------------- Forecast (v0)
export const DEFAULT_FORECAST = { tau_work: 8, tau_rest: 4, drift_hot: 0.15, drift_mild: 0.05, beta_wbgt: 2.0, hr_rest_shade: 85, sigma_growth: 0.05, hot_wbgt: 26 };

export function project(state, hrNow, wbgtNow, wbgtAt, horizon, scenario, p, conformal) {
  let s = { ...state }, hr = hrNow;
  const out = [];
  for (let m = 1; m <= horizon; m++) {
    const w = wbgtAt(m);
    if (scenario === 'work') {
      const drift = w >= p.hot_wbgt ? p.drift_hot : p.drift_mild;
      hr += (hrNow + p.beta_wbgt * (w - wbgtNow) + drift * m - hr) / p.tau_work;
    } else {
      hr += (p.hr_rest_shade + 0.5 * p.beta_wbgt * Math.max(0, w - p.hot_wbgt) - hr) / p.tau_rest;
    }
    s = ectStep(s, hr);
    const up = (conformal ? conformal.upper(s.ct) : s.ct + 0.5) + p.sigma_growth * Math.sqrt(m);
    out.push({ minute: m, hr, ct: s.ct, upper: up, wbgt: w });
  }
  return out;
}
export function minutesToThreshold(traj, thr) { for (const r of traj) if (r.upper >= thr) return r.minute; return null; }
export function restNeeded(traj, thr, margin = 0.3, maxRest = 45) {
  for (const r of traj) if (r.minute % 5 === 0 && r.upper < thr - margin) return r.minute;
  return maxRest;
}

// ---------------------------------------------------------------- Kidney heat-load ledger (v0)
export const LEDGER = { hot_ct: 38.0, red_degmin: 30, amber_degmin: 10, red_psi_min: 30, amber_psi_min: 10, dark_urine: 6, flag_red_days: 3, flag_dark_urine_days: 2 };
export function newDay(date) { return { date, minutes: 0, degmin: 0, psi_high_min: 0, max_ct: 0, urine: null, water: 0 }; }
export function addMinute(day, ct, psiValue) {
  day.minutes += 1; day.degmin += Math.max(0, ct - LEDGER.hot_ct);
  if (psiValue >= 7) day.psi_high_min += 1; day.max_ct = Math.max(day.max_ct, ct);
}
export function classifyDay(d) {
  if (d.degmin >= LEDGER.red_degmin || d.psi_high_min >= LEDGER.red_psi_min || (d.urine || 0) >= LEDGER.dark_urine) return 'red';
  if (d.degmin >= LEDGER.amber_degmin || d.psi_high_min >= LEDGER.amber_psi_min || (d.urine || 0) >= 4) return 'amber';
  return 'green';
}
export function kidneyFlag(days) {
  const last7 = days.slice(-7);
  const reds = last7.filter((d) => classifyDay(d) === 'red').length;
  if (reds >= LEDGER.flag_red_days) return { flag: true, reds, reason: 'red_days' };
  let run = 0;
  for (const d of last7) { run = (d.urine || 0) >= LEDGER.dark_urine ? run + 1 : 0; if (run >= LEDGER.flag_dark_urine_days) return { flag: true, reds, reason: 'dark_urine' }; }
  return { flag: false, reds, reason: '' };
}
