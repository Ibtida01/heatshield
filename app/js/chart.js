// Hand-rolled SVG charts (no library, works offline).

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Past 60 min of estimate + upper bound, and the next 60 min under "keep working" and "rest now".
export function strainChart({ past, work, rest, threshold, width = 640, height = 230 }) {
  const m = { l: 40, r: 14, t: 14, b: 28 };
  const W = width - m.l - m.r, H = height - m.t - m.b;
  const all = [...past.map((p) => p.upper), ...work.map((p) => p.upper), threshold + 0.4];
  const yMax = Math.max(39.5, Math.ceil(Math.max(...all) * 2) / 2), yMin = 36.5;
  const x = (min) => m.l + ((min + 60) / 120) * W;
  const y = (v) => m.t + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * H;
  const line = (pts, key) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.minute).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const band = (pts) => pts.length < 2 ? '' :
    `M${pts.map((p) => `${x(p.minute).toFixed(1)},${y(p.upper).toFixed(1)}`).join('L')}L${pts.slice().reverse().map((p) => `${x(p.minute).toFixed(1)},${y(p.ct).toFixed(1)}`).join('L')}Z`;
  let g = '';
  for (let v = Math.ceil(yMin); v <= yMax; v += 0.5) {
    const major = Number.isInteger(v);
    g += `<line x1="${m.l}" x2="${m.l + W}" y1="${y(v)}" y2="${y(v)}" class="grid${major ? ' major' : ''}"/>`;
    if (major) g += `<text x="${m.l - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}°</text>`;
  }
  for (const t of [-60, -30, 0, 30, 60]) {
    g += `<text x="${x(t)}" y="${height - 8}" class="tick" text-anchor="middle">${t === 0 ? 'now' : (t > 0 ? '+' : '') + t + ' min'}</text>`;
  }
  const pastPts = past.map((p) => ({ ...p }));
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="Body heat estimate, last hour and next hour">
    ${g}
    <path d="${band(pastPts)}" class="band"/>
    <path d="${band(work)}" class="band future"/>
    <line x1="${m.l}" x2="${m.l + W}" y1="${y(threshold)}" y2="${y(threshold)}" class="danger"/>
    <text x="${m.l + 4}" y="${y(threshold) - 5}" class="danger-label">danger ${threshold.toFixed(1)}°</text>
    <line x1="${x(0)}" x2="${x(0)}" y1="${m.t}" y2="${m.t + H}" class="now"/>
    ${pastPts.length > 1 ? `<path d="${line(pastPts, 'ct')}" class="est"/>` : ''}
    ${work.length ? `<path d="${line(work, 'ct')}" class="fc-work"/>` : ''}
    ${rest.length ? `<path d="${line(rest, 'ct')}" class="fc-rest"/>` : ''}
  </svg>`;
}

// Site WBGT for the working day, coloured by heat category.
export function wbgtStrip({ hours, nowT, utcOffset, width = 640, height = 120 }) {
  const day = hours;
  if (!day.length) return '';
  const m = { l: 34, r: 8, t: 10, b: 24 }, W = width - m.l - m.r, H = height - m.t - m.b;
  const lo = 20, hi = Math.max(36, ...day.map((d) => d.wbgtSun));
  const bw = W / day.length;
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * H;
  // TB MED 507 flag colours: below 1 grey, 1 white, 2 green, 3 yellow, 4 red, 5 black
  const col = ['#C9CED3', '#FFFFFF', '#3C9A5F', '#FFC20E', '#C8102E', '#000000'];
  let bars = '';
  day.forEach((d, i) => {
    const local = new Date(d.t + 30 * 60000 + utcOffset * 1000);
    const hh = local.getUTCHours();
    const isNow = nowT >= d.t - 30 * 60000 && nowT < d.t + 30 * 60000;
    bars += `<rect x="${(m.l + i * bw + 1).toFixed(1)}" y="${y(d.wbgtSun).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(m.t + H - y(d.wbgtSun)).toFixed(1)}" fill="${col[d.cat]}" ${isNow ? 'class="nowbar"' : ''}><title>${String(hh).padStart(2, '0')}:00 WBGT ${d.wbgtSun.toFixed(1)}°C, heat category ${d.cat || 'below 1'}</title></rect>`;
    if (hh % 3 === 0) bars += `<text x="${(m.l + i * bw + bw / 2).toFixed(1)}" y="${height - 8}" class="tick" text-anchor="middle">${String(hh).padStart(2, '0')}</text>`;
  });
  let g = '';
  for (const v of [25, 30, 35]) if (v <= hi) g += `<line x1="${m.l}" x2="${m.l + W}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${m.l - 5}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}°</text>`;
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="Site WBGT by hour">${g}${bars}</svg>`;
}

export { esc };
