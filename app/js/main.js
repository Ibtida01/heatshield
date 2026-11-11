import { Conformal, DEFAULT_FORECAST, heatCategory, classifyDay, kidneyFlag, newDay } from './models.js';
import { SITES, loadWeather, wbgtAt } from './weather.js';
import { SimBody, CREW } from './sim.js';
import { Monitor } from './monitor.js';
import { LANGS, t } from './i18n.js';
import { speak, voiceAvailable } from './voice.js';
import { bleSupported, connectHeartRate, MinuteAverager } from './ble.js';
import { sign } from './signs.js';
import { strainChart, wbgtStrip, esc } from './chart.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('hs.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hs.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  clear() { try { Object.keys(localStorage).filter((k) => k.startsWith('hs.')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } },
};

const DEFAULTS = { lang: 'en', site: 'abudhabi', wxMode: 'replay', date: null, speed: 30, level: 'heavy', acclimatised: true,
  startHour: 7, source: 'sim', voice: true, exampleWeek: true, consent: false };
const S = { ...DEFAULTS, ...store.get('settings', {}) };
// Shareable demo links, e.g. index.html?lang=bn&site=dubai&start=10&level=heavy&accl=no&jump=60#kiosk
const Q = new URLSearchParams(location.search);
if (Q.get('lang') && LANGS[Q.get('lang')]) S.lang = Q.get('lang');
if (Q.get('site') && SITES[Q.get('site')]) S.site = Q.get('site');
if (Q.get('start')) S.startHour = Math.min(17, Math.max(5, Number(Q.get('start'))));
if (Q.get('speed')) S.speed = Number(Q.get('speed'));
if (['light', 'moderate', 'heavy'].includes(Q.get('level'))) S.level = Q.get('level');
if (Q.get('accl')) S.acclimatised = Q.get('accl') !== 'no';
if (Q.get('date')) S.date = Q.get('date');
const JUMP = Math.min(600, Number(Q.get('jump') || 0));
const save = () => store.set('settings', S);

let calib = null, conformal = null, fparams = { ...DEFAULT_FORECAST };
let wx = null, now = 0, acc = 0, running = false, ble = null, averager = null;
let you = null, youBody = null, crew = [];
let ledger = store.get('ledger', []);
const lastSpoken = { key: null, at: 0 };
let kidneySpoken = false;

// ---------------------------------------------------------------- time helpers
const off = () => (wx ? wx.utcOffset : 0) * 1000;
const local = (ms) => new Date(ms + off());
const hhmm = (ms) => { const d = local(ms); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const dateKey = (ms) => local(ms).toISOString().slice(0, 10);
function middayBreak(ms) {
  if (SITES[S.site].country !== 'AE') return false;
  const d = local(ms), md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate(), mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return md >= 615 && md <= 915 && mins >= 750 && mins < 900;
}
function shiftStart() {
  if (S.source === 'ble' || S.wxMode === 'live') return Date.now();
  const date = S.date || SITES[S.site].replay;
  return Date.parse(`${date}T${String(S.startHour).padStart(2, '0')}:00:00Z`) - off();
}

// ---------------------------------------------------------------- setup
async function loadCalibration() {
  try {
    calib = await (await fetch('./model/calibration.json')).json();
    conformal = new Conformal(calib);
    if (calib.forecast) fparams = { ...DEFAULT_FORECAST, ...calib.forecast };
  } catch { calib = null; conformal = null; }
}

function makeWorkers() {
  you = new Monitor({ id: 'you', name: 'You', task: 'This phone', acclimatised: S.acclimatised, hrRest: 70, conformal, fparams });
  youBody = new SimBody({ seed: 42, acclimatised: S.acclimatised });
  crew = CREW.map((c, i) => ({ ...c, body: new SimBody({ seed: 100 + i, fitness: c.fitness, acclimatised: c.acclimatised, hrOffset: c.hrOffset }),
    mon: new Monitor({ id: c.id, name: c.name, task: c.task, acclimatised: c.acclimatised, hrRest: 68, conformal, fparams }) }));
}

async function restart() {
  running = false;
  $('demoNote').textContent = 'Loading site weather…';
  wx = await loadWeather(S.site, S.wxMode === 'live' || S.source === 'ble' ? 'live' : 'replay', S.date);
  makeWorkers();
  now = shiftStart();
  acc = 0;
  renderStatic();
  for (let i = 0; i < 2 + JUMP; i++) step();      // warm start so the screen is never empty
  renderAll();
  running = true;
}

// ---------------------------------------------------------------- simulation step (one minute)
function ctxAt(base) { return { at: (m, shade) => wbgtAt(wx, base + m * 60000, shade) }; }

function step(hrFromBand = undefined) {
  const brk = middayBreak(now), key = dateKey(now), ctx = ctxAt(now);
  // the phone's own worker
  if (brk && !you.resting) you.startRest(now, 'break');
  if (!brk && you.restReason === 'break') you.endRest();
  const hr = S.source === 'ble' ? hrFromBand ?? null : youBody.minute(S.level, ctx.at(0, you.resting), you.resting);
  const r = you.update(now, hr, ctx, key);
  alerts(r);
  // simulated crew: they follow alerts after a short delay, and return when cooled
  for (const c of crew) {
    if (brk && !c.mon.resting) c.mon.startRest(now, 'break');
    if (!brk && c.mon.restReason === 'break') c.mon.endRest();
    const h = c.body.minute(c.level, ctx.at(0, c.mon.resting), c.mon.resting);
    const res = c.mon.update(now, h, ctx, key);
    if (res.tier === 'red' && !c.mon.resting) { c.redFor = (c.redFor || 0) + 1; if (c.redFor >= 3) { c.mon.startRest(now, 'alert'); c.redFor = 0; } }
    if (c.mon.resting && c.mon.restReason !== 'break' && c.mon.out.upper < c.mon.threshold - 0.3) c.mon.endRest();
  }
  saveLedger();
  now += 60000;
}

function alerts({ prev, tier }) {
  if (!S.voice) return;
  const rank = { green: 0, amber: 1, red: 2, rest: -1 };
  let key = null;
  if (tier === 'red' && (prev !== 'red' || Date.now() - lastSpoken.at > 45000)) key = 'v_red';
  else if (tier === 'amber' && rank[prev] < 1 && prev !== 'rest') key = 'v_amber';
  else if (you.resting && you.restReason !== 'break' && you.out.upper < you.threshold - 0.3 && lastSpoken.key !== 'v_cool') key = 'v_cool';
  if (key && (key !== lastSpoken.key || Date.now() - lastSpoken.at > 45000)) {
    speak(S.lang, key, t(S.lang, key));
    lastSpoken.key = key; lastSpoken.at = Date.now();
  }
}

function saveLedger() {
  if (!you.day) return;
  const i = ledger.findIndex((d) => d.date === you.day.date);
  if (i >= 0) ledger[i] = { ...you.day }; else ledger.push({ ...you.day });
  ledger = ledger.slice(-30);
  if (you.day.minutes % 5 === 0) store.set('ledger', ledger);
}

// ---------------------------------------------------------------- render
function renderStatic() {
  const L = LANGS[S.lang];
  document.documentElement.lang = S.lang;
  document.documentElement.dir = L.dir;
  $('brand').innerHTML = `${sign('amber', 28)}HeatShield`;
  $('siteName').textContent = SITES[S.site].name;
  $('btnWater').innerHTML = `${sign('water', 52)}<span>${esc(t(S.lang, 'water'))}</span>`;
  $('btnUrine').innerHTML = `${sign('urine', 52)}<span>${esc(t(S.lang, 'urine'))}</span>`;
  $('lblBody').textContent = t(S.lang, 'body');
  $('lblHeart').textContent = t(S.lang, 'heart');
  $('lblSite').textContent = t(S.lang, 'site');
  $('tabWorker').textContent = t(S.lang, 'tab_worker');
  $('tabCrew').textContent = t(S.lang, 'tab_crew');
  $('tabWeek').textContent = t(S.lang, 'tab_week');
  $('tabAbout').textContent = t(S.lang, 'tab_about');
  $('urineQ').textContent = t(S.lang, 'urine_q');
  $('urineCancel').textContent = t(S.lang, 'cancel');
  const src = wx ? wx.source : { label: '' };
  const cal = calib ? (calib.synthetic ? 'The safety margin uses a synthetic test calibration until you run the validation script.' : `Safety margin calibrated on ${calib.source} (${calib.subjects} people).`) : 'No calibration file found; using a fixed 0.5 °C margin.';
  const who = S.source === 'ble' ? 'Live heart rate from your band.' : 'Simulated worker.';
  const voiceNote = S.voice && !voiceAvailable(S.lang) ? ` No ${LANGS[S.lang].name} voice on this device; alerts vibrate and show on screen.` : '';
  $('demoNote').innerHTML = `Demo mode. ${who} Weather: ${src.url ? `<a href="${esc(src.url)}" rel="noopener">${esc(src.label)}</a>` : esc(src.label)}. ${esc(cal)}${esc(voiceNote)}`;
  renderModelCard();
}

function tierView() {
  const o = you.out;
  if (you.resting && you.restReason === 'break') return { tier: 'break', title: t(S.lang, 'break_t'), body: t(S.lang, 'break_b'), sign: 'rest' };
  if (you.resting) {
    const cooled = o.upper < you.threshold - 0.3;
    return { tier: cooled ? 'green' : 'rest', title: cooled ? t(S.lang, 'green_t') : t(S.lang, 'rest_t'),
      body: cooled ? t(S.lang, 'v_cool') : t(S.lang, 'rest_b'), sign: cooled ? 'green' : 'rest', cooled };
  }
  return { tier: you.tier, title: t(S.lang, `${you.tier}_t`), body: t(S.lang, `${you.tier}_b`), sign: you.tier };
}

function renderWorker() {
  const o = you.out, v = tierView();
  $('worker').dataset.tier = v.tier;
  $('sign').innerHTML = sign(v.sign, 190, v.title);
  $('statusTitle').textContent = v.title;
  $('statusBody').textContent = v.body;
  let cd;
  if (you.resting && !v.cooled) cd = t(S.lang, 'cool_in', { m: o.restMin });
  else if (you.resting) cd = '';
  else if (o.mtt === 0) cd = t(S.lang, 'danger_now');
  else if (o.mtt == null) cd = t(S.lang, 'danger_none');
  else cd = t(S.lang, 'danger_in', { m: o.mtt });
  // make the number the loudest thing on screen, whatever the word order of the language
  const parts = cd.split(/(\d+)/);
  $('countdown').innerHTML = parts.map((p) => (/^\d+$/.test(p) ? `<span class="n">${p}</span>` : esc(p))).join('');
  $('valBody').innerHTML = `${o.ct.toFixed(1)}°C<small>${esc(t(S.lang, 'upto', { v: o.upper.toFixed(1) + '°' }))}</small>`;
  $('valHr').innerHTML = o.hr ? `${Math.round(o.hr)}<small>bpm</small>` : '--';
  $('valWbgt').innerHTML = `${(o.wbgt ?? 0).toFixed(1)}°C<small>${you.resting ? 'shade' : 'sun'}</small>`;
  const past = you.history.map((h) => ({ minute: Math.round((h.t - now) / 60000) + 1, ct: h.ct, upper: h.upper }));
  $('chart').innerHTML = strainChart({ past, work: you.resting ? [] : o.work, rest: o.rest, threshold: you.threshold });
  $('btnRest').innerHTML = `${sign(you.resting ? 'green' : 'rest', 52)}<span>${esc(t(S.lang, you.resting ? 'resume' : 'rest'))}</span>`;
  $('btnRest').classList.toggle('primary', !you.resting && (you.tier === 'red' || you.tier === 'amber'));
  $('btnRest').disabled = you.restReason === 'break';
  const mins = you.lastWater ? Math.round((now - you.lastWater) / 60000) : null;
  $('waterNote').textContent = mins == null ? t(S.lang, 'no_water') : t(S.lang, 'last_water', { m: mins });
  $('clock').textContent = hhmm(now);
}

function crewStatus(m) {
  const o = m.out;
  if (m.resting && m.restReason === 'break') return { kind: 'rest', text: 'Midday break', order: 4 };
  if (m.resting) return { kind: 'rest', text: o.restMin >= 45 ? 'Resting, 45+ min left' : `Resting, about ${o.restMin} min left`, order: 3 };
  if (m.tier === 'red') return { kind: 'red', text: o.mtt === 0 ? 'Danger now' : `Danger in ${o.mtt} min`, order: 0 };
  if (m.tier === 'amber') return { kind: 'amber', text: o.mtt != null ? `Danger in ${o.mtt} min` : 'Slow down', order: 1 };
  return { kind: 'green', text: o.mtt == null ? 'OK for the next hour' : `OK, danger in ${o.mtt} min`, order: 2 };
}

function renderCrew() {
  const wNow = wbgtAt(wx, now, false), cat = heatCategory(wNow);
  const catName = ['below category 1', 'category 1 of 5', 'category 2 of 5', 'category 3 of 5', 'category 4 of 5', 'category 5 of 5'][cat];
  const flagCol = ['#C9CED3', '#FFFFFF', '#3C9A5F', '#FFC20E', '#C8102E', '#000000'][cat];
  $('siteWbgt').textContent = `${wNow.toFixed(1)}°C`;
  $('siteCat').innerHTML = `<i style="background:${flagCol}"></i>Heat ${catName}`;
  $('breakBanner').hidden = !middayBreak(now);
  const today = dateKey(now);
  const dayHours = wx.hours.filter((h) => { const d = local(h.t + 30 * 60000); const hh = d.getUTCHours(); return d.toISOString().slice(0, 10) === today && hh >= 5 && hh <= 19; });
  $('wbgtStrip').innerHTML = wbgtStrip({ hours: dayHours, nowT: now, utcOffset: wx.utcOffset });

  const everyone = [{ ...you, name: 'You', task: 'This phone', mon: you, isYou: true }, ...crew.map((c) => ({ ...c, isYou: false }))];
  const rows = everyone.map((w) => ({ w, s: crewStatus(w.mon) })).sort((a, b) => a.s.order - b.s.order || (a.w.mon.out.mtt ?? 99) - (b.w.mon.out.mtt ?? 99));
  const restNow = rows.filter((r) => r.s.kind === 'red').map((r) => r.w.name);
  const restNext = rows.filter((r) => r.s.kind === 'amber').slice(0, 2).map((r) => r.w.name);
  $('rotation').innerHTML = middayBreak(now) ? '<p><b>Everyone rests until 15:00.</b></p>'
    : `<p><b>Rest now:</b> ${restNow.length ? esc(restNow.join(', ')) : 'nobody'}</p><p><b>Rest next:</b> ${restNext.length ? esc(restNext.join(', ')) : 'nobody'}</p>`;
  $('crewList').innerHTML = rows.map(({ w, s }) => `<li class="${w.isYou ? 'you' : ''}">${sign(s.kind, 44, s.text)}
    <div class="who"><strong>${esc(w.name)}</strong><span>${esc(w.task)}${w.mon.acclimatised ? '' : ' · not yet used to the heat'}</span></div>
    <div class="state"><b>${esc(s.text)}</b>${!w.mon.resting && !w.isYou ? `<button type="button" data-rest="${w.id}">Send to rest</button>` : ''}</div></li>`).join('');
}

function exampleDays(today) {
  const base = new Date(today + 'T00:00:00Z');
  const preset = [['amber', 18, 12, 4], ['red', 44, 36, 6], ['green', 4, 2, 3], ['red', 38, 31, 5], ['amber', 14, 9, 4], ['red', 52, 40, 6]];
  return preset.map(([, degmin, psiMin, urine], i) => {
    const d = new Date(base.getTime() - (6 - i) * 86400000).toISOString().slice(0, 10);
    return { ...newDay(d), minutes: 480, degmin, psi_high_min: psiMin, max_ct: 38 + degmin / 40, urine, water: 8, example: true };
  });
}

function weekDays() {
  const today = dateKey(now);
  const real = ledger.filter((d) => d.date < today).slice(-6);
  const hist = S.exampleWeek ? exampleDays(today).filter((e) => !real.some((r) => r.date === e.date)).concat(real).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-6) : real;
  return [...hist, you.day || newDay(today)];
}

function renderWeek() {
  const days = weekDays();
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  $('days').innerHTML = days.map((d, i) => {
    const c = classifyDay(d), last = i === days.length - 1;
    return `<figure class="${last ? 'today' : ''}">${sign(c, 64, `${d.date}: ${c}`)}<figcaption>${last ? 'Today' : names[new Date(d.date + 'T00:00:00Z').getUTCDay()]}</figcaption></figure>`;
  }).join('');
  $('exampleNote').textContent = S.exampleWeek ? 'Earlier days are example history for the demo.' : '';
  const d = you.day || newDay(dateKey(now));
  $('todayKv').innerHTML = `
    <div><b>${Math.round(d.degmin)}</b><span>degree-minutes above 38 °C today</span></div>
    <div><b>${d.psi_high_min}</b><span>minutes of high strain (PSI 7+)</span></div>
    <div><b>${d.water}</b><span>water breaks logged</span></div>
    <div><b>${d.urine ?? '–'}</b><span>urine colour (1 pale to 8 dark)</span></div>`;
  const f = kidneyFlag(days);
  $('kidneyBox').hidden = !f.flag;
  if (f.flag) {
    $('kidneyText').textContent = f.reason === 'red_days'
      ? `You had ${f.reds} high-strain days in the last 7. A simple blood and urine test at the clinic checks how your kidneys are coping with the heat.`
      : 'Your urine was dark on two days in a row. Drink more water and get a simple kidney check at the clinic.';
    if (!kidneySpoken && document.body.dataset.tab === 'week' && S.voice) { speak(S.lang, 'v_kidney', t(S.lang, 'v_kidney')); kidneySpoken = true; }
  }
}

function renderModelCard() {
  const c = calib;
  const rows = [
    ['Core temperature estimator', 'Extended Kalman filter from 1-minute heart rate (Buller et al. 2013), no per-person training needed'],
    ['Safety margin', c ? `Stratified split-conformal upper bound, target coverage ${Math.round((1 - c.alpha) * 100)}%` : 'Fixed +0.5 °C (no calibration file)'],
    ['Calibrated on', c ? `${esc(c.source)}, ${c.subjects} people, ${c.minutes} minutes (${c.created})` : '—'],
    ['Coverage on held-out people', c && c.test_coverage ? `${(c.test_coverage * 100).toFixed(1)}%` : '—'],
    ['Alert thresholds', 'Estimated core temperature upper bound 38.5 °C if used to the heat, 38.0 °C if not (ACGIH heat-stress guidance); PSI 7 or more; or under 10 minutes to danger'],
    ['Forecast', `Physiology-based projection v0: drift ${fparams.drift_hot} bpm/min in heat, heart-rate time constant ${fparams.tau_work} min. To be refitted on field data.`],
    ['Heat stress', 'Outdoor WBGT, Liljegren et al. 2008 model; checked against the PyWBGT reference within 0.01 °C'],
  ];
  if (c && c.synthetic) rows.unshift(['Warning', 'This calibration comes from SYNTHETIC test data. Run research/scripts/validate_buono.py on the real dataset before any demo claim.']);
  $('modelCard').innerHTML = rows.map(([k, v]) => `<tr class="${k === 'Warning' ? 'warnrow' : ''}"><th scope="row">${k}</th><td>${v}</td></tr>`).join('');
}

function renderAll() { renderWorker(); renderCrew(); if (document.body.dataset.tab === 'week') renderWeek(); }

// ---------------------------------------------------------------- loop
let lastFrame = performance.now();
function loop(ts) {
  const dt = (ts - lastFrame) / 1000; lastFrame = ts;
  if (running && wx) {
    if (S.source === 'ble') {
      if (averager && averager.ready()) { now = Date.now(); step(averager.take()); renderAll(); }
      $('clock').textContent = hhmm(Date.now());
    } else {
      acc += dt * S.speed;
      let n = 0;
      while (acc >= 60 && n < 5) { step(); acc -= 60; n++; }
      if (n) renderAll();
    }
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- events
function selectTab(tab) {
  document.body.dataset.tab = tab;
  const wide = matchMedia('(min-width: 1000px)').matches;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  $('worker').hidden = !wide && tab !== 'worker';
  for (const id of ['crew', 'week', 'about']) $(id).hidden = id !== tab && !(wide && tab === 'worker' && id === 'crew');
  if (tab === 'week') renderWeek();
}

function bindDemoForm() {
  const f = $('demoDlg');
  $('site').innerHTML = Object.entries(SITES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  $('startHour').innerHTML = Array.from({ length: 12 }, (_, i) => i + 6).map((h) => `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`).join('');
  const sync = () => {
    f.querySelector(`input[name=src][value=${S.source}]`).checked = true;
    f.querySelector(`input[name=wx][value=${S.wxMode}]`).checked = true;
    f.querySelector(`input[name=speed][value="${S.speed}"]`).checked = true;
    f.querySelector(`input[name=level][value=${S.level}]`).checked = true;
    f.querySelector(`input[name=accl][value=${S.acclimatised ? 'yes' : 'no'}]`).checked = true;
    $('site').value = S.site; $('startHour').value = String(S.startHour);
    $('replayDate').value = S.date || SITES[S.site].replay;
    $('exampleWeek').checked = S.exampleWeek; $('voiceOn').checked = S.voice;
    $('bleStatus').textContent = bleSupported() ? (ble ? `Connected: ${ble.name}` : 'Choose "Bluetooth band" to pair a standard heart-rate strap.') : 'This browser cannot use Bluetooth. Use Chrome on Android or a laptop.';
  };
  $('demoBtn').onclick = () => { sync(); f.showModal(); };
  $('btnCloseDemo').onclick = () => f.close();
  f.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.name === 'speed') S.speed = Number(el.value);
    if (el.name === 'level') S.level = el.value;
    if (el.name === 'accl') { S.acclimatised = el.value === 'yes'; you.acclimatised = S.acclimatised; youBody.acclimatised = S.acclimatised; }
    if (el.id === 'exampleWeek') { S.exampleWeek = el.checked; renderWeek(); }
    if (el.id === 'voiceOn') S.voice = el.checked;
    if (el.name === 'wx') { S.wxMode = el.value; save(); await restart(); }
    if (el.id === 'site') { S.site = el.value; S.date = null; $('replayDate').value = SITES[S.site].replay; save(); await restart(); }
    if (el.id === 'replayDate') { S.date = el.value; save(); await restart(); }
    if (el.id === 'startHour') { S.startHour = Number(el.value); save(); await restart(); }
    if (el.name === 'src') {
      if (el.value === 'ble') {
        if (!bleSupported()) { $('bleStatus').textContent = 'This browser cannot use Bluetooth. Use Chrome on Android or a laptop.'; f.querySelector('input[name=src][value=sim]').checked = true; return; }
        try {
          averager = new MinuteAverager();
          ble = await connectHeartRate((hr) => averager.add(hr), () => { ble = null; $('bleStatus').textContent = 'Band disconnected.'; });
          S.source = 'ble'; S.speed = 1; save(); await restart();
          $('bleStatus').textContent = `Connected: ${ble.name}. Readings update once a minute.`;
        } catch (err) {
          $('bleStatus').textContent = `Could not connect: ${err.message}`;
          f.querySelector('input[name=src][value=sim]').checked = true;
        }
      } else { if (ble) ble.disconnect(); ble = null; S.source = 'sim'; save(); await restart(); }
    }
    save(); renderStatic(); renderAll();
  });
  $('btnRestart').onclick = async () => { f.close(); await restart(); };
  $('btnSkip').onclick = () => { for (let i = 0; i < 30; i++) step(); renderAll(); };
  $('btnReset').onclick = async () => { store.clear(); ledger = []; Object.assign(S, DEFAULTS, { consent: true }); save(); f.close(); await restart(); };
}

function bindActions() {
  $('btnWater').onclick = () => { you.drink(now); renderWorker(); };
  $('btnRest').onclick = () => { if (you.resting) you.endRest(); else you.startRest(now); renderWorker(); };
  $('btnUrine').onclick = () => $('urineDlg').showModal();
  $('urineCancel').onclick = () => $('urineDlg').close();
  const cols = ['#F7F4CF', '#F2EDA4', '#EEE27A', '#E8D24F', '#DEBE33', '#CFA329', '#B48521', '#8C681C'];
  $('swatches').innerHTML = cols.map((c, i) => `<button type="button" data-u="${i + 1}" style="background:${c}" aria-label="Colour ${i + 1}">${i + 1}</button>`).join('');
  $('swatches').onclick = (e) => {
    const b = e.target.closest('button[data-u]'); if (!b) return;
    if (you.day) you.day.urine = Number(b.dataset.u);
    saveLedger(); store.set('ledger', ledger); $('urineDlg').close(); renderWeek();
  };
  $('crewList').onclick = (e) => {
    const b = e.target.closest('button[data-rest]'); if (!b) return;
    const c = crew.find((x) => x.id === b.dataset.rest); if (c) { c.mon.startRest(now, 'supervisor'); renderCrew(); }
  };
  for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => selectTab(b.dataset.tab);
  $('lang').innerHTML = Object.entries(LANGS).map(([k, l]) => `<option value="${k}">${l.name}</option>`).join('');
  $('lang').value = S.lang;
  $('lang').onchange = (e) => { S.lang = e.target.value; save(); renderStatic(); renderAll(); };
  $('btnReferral').onclick = async () => {
    const days = weekDays(), reds = days.filter((d) => classifyDay(d) === 'red');
    const text = `HeatShield referral note (not a diagnosis)\nHigh-strain days in the last 7: ${reds.length} (${reds.map((d) => d.date).join(', ')})\nHighest estimated core temperature: ${Math.max(...days.map((d) => d.max_ct)).toFixed(1)} °C\nDarkest urine colour: ${Math.max(...days.map((d) => d.urine || 0))} of 8\nSuggested check: serum creatinine and urinalysis.`;
    try { if (navigator.share) await navigator.share({ title: 'HeatShield referral note', text }); else { await navigator.clipboard.writeText(text); $('btnReferral').textContent = 'Copied'; } } catch { /* user cancelled */ }
  };
  $('consentOk').onclick = () => { S.consent = true; save(); $('consentDlg').close(); };
  addEventListener('resize', () => selectTab(document.body.dataset.tab));
}

// ---------------------------------------------------------------- start
(async function main() {
  bindActions(); bindDemoForm();
  await loadCalibration();
  await restart();
  const tabQ = ['worker', 'crew', 'week', 'about'].includes(Q.get('tab')) ? Q.get('tab') : null;
  selectTab(tabQ || (matchMedia('(min-width: 1000px)').matches ? 'crew' : 'worker'));
  // #kiosk skips the consent screen for unattended booth demos and screenshots
  if (!S.consent && location.hash !== '#kiosk') $('consentDlg').showModal();
  requestAnimationFrame(loop);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
