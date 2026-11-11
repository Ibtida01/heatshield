// Site weather -> hourly WBGT in sun and shade.
// Live forecast and past-day replay both come from Open-Meteo (free, no key, CORS-enabled).
// If the network fails we use the last cached copy, then a bundled synthetic day.
import { solarPosition, wbgtOutdoor, heatCategory } from './models.js';

export const SITES = {
  abudhabi: { name: 'Abu Dhabi', lat: 24.4539, lon: 54.3773, country: 'AE', replay: '2025-07-15' },
  dubai: { name: 'Dubai', lat: 25.2048, lon: 55.2708, country: 'AE', replay: '2025-08-05' },
  doha: { name: 'Doha', lat: 25.2854, lon: 51.531, country: 'QA', replay: '2025-07-20' },
  riyadh: { name: 'Riyadh', lat: 24.7136, lon: 46.6753, country: 'SA', replay: '2025-08-01' },
  dhaka: { name: 'Dhaka', lat: 23.8103, lon: 90.4125, country: 'BD', replay: '2024-04-30' },
};

const VARS = 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,shortwave_radiation,direct_radiation,diffuse_radiation';

function urlFor(site, mode, date) {
  const base = `latitude=${site.lat}&longitude=${site.lon}&hourly=${VARS}&wind_speed_unit=ms&timezone=auto`;
  if (mode === 'live') return `https://api.open-meteo.com/v1/forecast?${base}&forecast_days=2`;
  return `https://archive-api.open-meteo.com/v1/archive?${base}&start_date=${date}&end_date=${date}`;
}

async function fetchJson(url, ms = 9000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

function cacheGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function cacheSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } }

export function buildHours(raw, site) {
  const h = raw.hourly, off = raw.utc_offset_seconds || 0;
  const hours = [];
  for (let i = 0; i < h.time.length; i++) {
    const tUtc = Date.parse(h.time[i] + ':00Z') - off * 1000;   // local -> UTC
    const mid = new Date(tUtc - 30 * 60000);                     // radiation = mean of preceding hour
    const sp = solarPosition(mid, site.lat, site.lon);
    const ghi = h.shortwave_radiation[i] ?? 0, dir = h.direct_radiation?.[i], dif = h.diffuse_radiation?.[i];
    const fdir = ghi > 5 && dir != null ? Math.min(dir / ghi, 0.9) : null;
    const base = { tC: h.temperature_2m[i], rhPct: h.relative_humidity_2m[i], pHpa: h.surface_pressure?.[i] ?? 1008,
      wind: h.wind_speed_10m[i] ?? 2, cza: sp.cza, R: sp.R };
    if ([base.tC, base.rhPct].some((x) => x == null)) continue;
    const sun = wbgtOutdoor({ ...base, solar: ghi, fdir });
    const shade = wbgtOutdoor({ ...base, solar: 0, fdir: 0 });
    hours.push({ t: tUtc - 30 * 60000, local: h.time[i], tC: base.tC, rh: base.rhPct, wind: base.wind, ghi,
      wbgtSun: sun.wbgt, wbgtShade: shade.wbgt, cat: heatCategory(sun.wbgt) });
  }
  return { hours, utcOffset: off };
}

export async function loadWeather(siteKey, mode, date) {
  const site = SITES[siteKey];
  const d = date || site.replay;
  const key = `hs.wx.${siteKey}.${mode}.${mode === 'live' ? '' : d}`;
  const url = urlFor(site, mode, d);
  try {
    const raw = await fetchJson(url);
    cacheSet(key, { raw, at: Date.now() });
    return { ...buildHours(raw, site), source: { kind: mode, label: mode === 'live' ? `Open-Meteo forecast, ${site.name}` : `Open-Meteo archive, ${site.name}, ${d}`, url, synthetic: false } };
  } catch (err) {
    const c = cacheGet(key);
    if (c) return { ...buildHours(c.raw, site), source: { kind: mode, label: `Cached Open-Meteo data, ${site.name} (offline)`, url, synthetic: false } };
    const raw = await (await fetch('./data/fallback_day.json')).json();
    return { ...buildHours(raw, SITES.abudhabi), source: { kind: 'fallback', label: 'Built-in synthetic hot day (no network)', url: null, synthetic: true } };
  }
}

// Linear interpolation of the hourly series at time t (ms UTC).
export function wbgtAt(wx, t, shade = false) {
  const H = wx.hours, k = shade ? 'wbgtShade' : 'wbgtSun';
  if (!H.length) return 28;
  if (t <= H[0].t) return H[0][k];
  for (let i = 1; i < H.length; i++) {
    if (t <= H[i].t) { const a = H[i - 1], b = H[i], f = (t - a.t) / (b.t - a.t); return a[k] + f * (b[k] - a[k]); }
  }
  return H[H.length - 1][k];
}
