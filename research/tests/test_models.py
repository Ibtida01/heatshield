import math
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from heatshield import ectemp, wbgt, solar, psi, conformal, forecast, ledger  # noqa: E402


def test_observation_inverse_roundtrip():
    for hr in (60, 90, 120, 150, 180):
        assert abs(ectemp.hr_from_ct(ectemp.ct_from_hr(hr)) - hr) < 1e-6


def test_filter_rises_with_sustained_high_hr_and_is_bounded():
    est, var = ectemp.run([150] * 180)
    assert est[-1] > 38.3 and est[-1] < 39.5
    assert all(b >= a - 1e-9 for a, b in zip(est, est[1:]))  # monotone rise
    assert var[-1] > 0


def test_filter_handles_missing_beats():
    est, _ = ectemp.run([120, None, float("nan"), 120])
    assert len(est) == 4 and all(math.isfinite(x) for x in est)


def test_solar_dhaka_solstice_noon():
    z, az, _ = solar.solar_position(datetime(2026, 6, 21, 6, 0, tzinfo=timezone.utc), 23.81, 90.41)
    assert z < 1.0


def test_wbgt_matches_pywbgt_reference():
    # Reference values from PyWBGT 3.0.7 tests (Liljegren C code), 2000-06-01 16 UTC
    lat = 33 + (43 + 59 / 60) / 60
    lon = -84 + (22 + 59 / 60) / 60
    z, _, R = solar.solar_position(datetime(2000, 6, 1, 15, 59, 30, tzinfo=timezone.utc), lat, lon)
    cza = math.cos(math.radians(z))
    cases = [(500, 985, 25, 15, 1, 27.218622), (805, 1013, 35, 25, 5, 33.58471)]
    for sol, p, ta, td, mph, ref in cases:
        rh = 100 * wbgt.esat(td + 273.15) / wbgt.esat(ta + 273.15)
        r = wbgt.wbgt_outdoor(ta, rh, p, mph * 0.44704, sol, None, cza, wind_height=2.0, sun_dist_au=R)
        assert abs(r.wbgt - ref) < 0.05


def test_wbgt_sun_hotter_than_shade():
    sun = wbgt.wbgt_outdoor(35, 50, 1005, 2, 900, 0.8, 0.9).wbgt
    shade = wbgt.wbgt_outdoor(35, 50, 1005, 2, 0, 0, 0.9).wbgt
    assert sun > shade + 2


def test_psi_range():
    assert psi.psi(37.0, 70) == 0
    assert 6 < psi.psi(38.8, 160) < 9
    assert psi.psi(41, 200) == 10


def test_conformal_upper_covers_on_synthetic_noise():
    import numpy as np
    rng = np.random.default_rng(0)
    est = rng.uniform(37, 39.5, 5000)
    true = est + rng.normal(0.1, 0.3, 5000)
    m = conformal.ConformalModel(alpha=0.1).fit(est[:2500], true[:2500])
    up = np.array([m.upper(x) for x in est[2500:]])
    cov = np.mean(true[2500:] <= up)
    assert 0.87 < cov < 0.93


def test_forecast_work_vs_rest():
    s = ectemp.ECTempState(38.0, 0.01)
    work = forecast.project(s, 150, 31, lambda m: 32, 45, "work")
    rest = forecast.project(s, 150, 31, lambda m: 32, 45, "rest")
    assert work[-1]["ct"] > rest[-1]["ct"]
    assert forecast.minutes_to_threshold(work, 38.5) is not None


def test_ledger_flags_repeated_red_days():
    days = []
    for i in range(7):
        d = ledger.DayRecord(date=f"2026-06-{i+1:02d}")
        for _ in range(60):
            d.add_minute(38.7 if i % 2 == 0 else 37.5, 7.5 if i % 2 == 0 else 3)
        days.append(d)
    flag, why = ledger.kidney_flag(days)
    assert flag and "high-strain" in why
