"""Write fixtures from the Python models so app/tests/parity.mjs can check the JS port."""
import json
import math
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from heatshield import ectemp, wbgt, solar, psi, forecast  # noqa: E402

hr = [70 + 0.6 * i + 5 * math.sin(i / 7) for i in range(120)]
est, var = ectemp.run(hr)
wb_cases = []
for args in [(35, 40, 1010, 3, 800, 0.8, 0.8), (40, 30, 1005, 4, 900, None, 0.9), (30, 80, 1008, 2, 0, 0, 0.8),
             (45, 20, 1000, 5, 950, 0.85, 0.95), (28, 60, 1012, 1, 300, None, 0.3)]:
    r = wbgt.wbgt_outdoor(*args)
    wb_cases.append({"args": args, "wbgt": r.wbgt, "globe": r.globe, "nwb": r.nat_wet_bulb})
sol = []
for (y, mo, d, h, mi), lat, lon in [((2026, 6, 21, 6, 0), 23.81, 90.41), ((2025, 7, 15, 8, 30), 24.45, 54.38),
                                    ((2024, 12, 1, 3, 15), -33.9, 151.2)]:
    z, az, R = solar.solar_position(datetime(y, mo, d, h, mi, tzinfo=timezone.utc), lat, lon)
    sol.append({"utc": f"{y:04d}-{mo:02d}-{d:02d}T{h:02d}:{mi:02d}:00Z", "lat": lat, "lon": lon, "zen": z, "az": az, "R": R})
s = ectemp.ECTempState(38.0, 0.01)
traj = forecast.project(s, 150, 31, lambda m: 31 + 0.02 * m, 45, "work")
out = {"hr": hr, "ct_est": est, "var": var, "wbgt": wb_cases, "solar": sol,
       "psi": [[38.6, 155, psi.psi(38.6, 155)], [37.4, 95, psi.psi(37.4, 95)]],
       "forecast_last": traj[-1]}
path = os.path.join(os.path.dirname(__file__), "..", "..", "app", "tests", "fixtures.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump(out, open(path, "w", encoding="utf-8"))
print("wrote", os.path.normpath(path))
