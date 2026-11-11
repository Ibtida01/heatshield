// node app/tests/parity.mjs  — checks the JS models match the Python package.
import { readFileSync } from 'node:fs';
import { ectStep, ECT, wbgtOutdoor, solarPosition, psi, project, DEFAULT_FORECAST } from '../js/models.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
let fails = 0;
const check = (name, a, b, tol) => { if (!(Math.abs(a - b) <= tol)) { fails++; console.log(`FAIL ${name}: js=${a} py=${b}`); } };

let s = { ct: ECT.CT0, v: 0 };
fx.hr.forEach((h, i) => { s = ectStep(s, h); check(`ectemp[${i}]`, s.ct, fx.ct_est[i], 1e-9); });
for (const c of fx.wbgt) {
  const [tC, rhPct, pHpa, wind, solar, fdir, cza] = c.args;
  const r = wbgtOutdoor({ tC, rhPct, pHpa, wind, solar, fdir, cza });
  check(`wbgt${JSON.stringify(c.args)}`, r.wbgt, c.wbgt, 1e-6);
}
for (const c of fx.solar) {
  const p = solarPosition(new Date(c.utc), c.lat, c.lon);
  check(`zen ${c.utc}`, p.zenith, c.zen, 1e-3); check(`az ${c.utc}`, p.azimuth, c.az, 1e-3);
}
for (const [tc, hr, v] of fx.psi) check(`psi ${tc},${hr}`, psi(tc, hr), v, 1e-9);
const traj = project({ ct: 38.0, v: 0.01 }, 150, 31, (m) => 31 + 0.02 * m, 45, 'work', DEFAULT_FORECAST, null);
check('forecast ct', traj.at(-1).ct, fx.forecast_last.ct, 1e-9);
check('forecast upper', traj.at(-1).upper, fx.forecast_last.ct_upper, 1e-9);
console.log(fails ? `${fails} parity failures` : 'JS and Python models agree');
process.exit(fails ? 1 : 0);
