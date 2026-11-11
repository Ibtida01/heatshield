"""Solar position (NOAA spreadsheet algorithm, accurate to ~0.01 deg for 1900-2100).

solar_position(dt_utc, lat, lon) -> (zenith_deg, azimuth_deg, earth_sun_distance_au)
Azimuth is measured clockwise from true north.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone


def _julian_day(dt: datetime) -> float:
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    y, m = dt.year, dt.month
    d = dt.day + (dt.hour + (dt.minute + (dt.second + dt.microsecond / 1e6) / 60.0) / 60.0) / 24.0
    if m <= 2:
        y -= 1
        m += 12
    a = y // 100
    b = 2 - a + a // 4
    return int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + d + b - 1524.5


def solar_position(dt_utc: datetime, lat: float, lon: float):
    jd = _julian_day(dt_utc)
    jc = (jd - 2451545.0) / 36525.0
    rad, deg = math.radians, math.degrees

    L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360.0
    M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
    e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
    C = (math.sin(rad(M)) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
         + math.sin(rad(2 * M)) * (0.019993 - 0.000101 * jc)
         + math.sin(rad(3 * M)) * 0.000289)
    true_long = L0 + C
    true_anom = M + C
    R = (1.000001018 * (1 - e * e)) / (1 + e * math.cos(rad(true_anom)))
    omega = 125.04 - 1934.136 * jc
    app_long = true_long - 0.00569 - 0.00478 * math.sin(rad(omega))
    mean_obliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
    obliq = mean_obliq + 0.00256 * math.cos(rad(omega))
    decl = deg(math.asin(math.sin(rad(obliq)) * math.sin(rad(app_long))))
    y = math.tan(rad(obliq / 2)) ** 2
    eq_time = 4 * deg(y * math.sin(2 * rad(L0)) - 2 * e * math.sin(rad(M))
                      + 4 * e * y * math.sin(rad(M)) * math.cos(2 * rad(L0))
                      - 0.5 * y * y * math.sin(4 * rad(L0)) - 1.25 * e * e * math.sin(2 * rad(M)))

    if dt_utc.tzinfo is not None:
        dt_utc = dt_utc.astimezone(timezone.utc)
    minutes = dt_utc.hour * 60 + dt_utc.minute + dt_utc.second / 60.0
    tst = (minutes + eq_time + 4 * lon) % 1440.0
    ha = tst / 4.0 - 180.0 if tst >= 0 else tst / 4.0 + 180.0

    cos_zen = (math.sin(rad(lat)) * math.sin(rad(decl))
               + math.cos(rad(lat)) * math.cos(rad(decl)) * math.cos(rad(ha)))
    cos_zen = max(-1.0, min(1.0, cos_zen))
    zen = deg(math.acos(cos_zen))
    denom = math.cos(rad(lat)) * math.sin(rad(zen))
    if abs(denom) < 1e-9:
        az = 180.0 if lat > decl else 0.0
    else:
        x = ((math.sin(rad(lat)) * math.cos(rad(zen))) - math.sin(rad(decl))) / denom
        x = max(-1.0, min(1.0, x))
        if ha > 0:
            az = (deg(math.acos(x)) + 180.0) % 360.0
        else:
            az = (540.0 - deg(math.acos(x))) % 360.0
    return zen, az, R
