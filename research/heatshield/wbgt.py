"""Outdoor Wet Bulb Globe Temperature (WBGT) from standard weather variables.

Implements the physical model of Liljegren JC, Carhart RA, Lawday P, Tschopp S,
Sharp R (2008) "Modeling the wet bulb globe temperature using standard
meteorological measurements", J Occup Environ Hyg 5:645-655. This model is the
one most often recommended for outdoor work (Lemke & Kjellstrom 2012).

Simplifications (document them in your limitations section):
- Wind at 10 m is scaled to 2 m with a neutral-stability power law
  (exponent 0.25 urban / 0.15 rural) instead of the full Pasquill classes.
- The direct-beam fraction comes straight from the forecast
  (direct / global radiation) instead of Liljegren's empirical estimate.
- Ground surface temperature is taken as air temperature.

Units: temperatures in deg C in the public API, pressure in hPa, wind in m/s,
solar in W/m2 (global horizontal), RH in %.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

STEFANB = 5.6696e-8
CP = 1003.5
M_AIR = 28.97
M_H2O = 18.015
RATIO = CP * M_AIR / M_H2O
R_GAS = 8314.34
R_AIR = R_GAS / M_AIR
PR = CP / (CP + 1.25 * R_AIR)

EMIS_WICK, ALB_WICK, D_WICK, L_WICK = 0.95, 0.4, 0.007, 0.0254
EMIS_GLOBE, ALB_GLOBE, D_GLOBE = 0.95, 0.05, 0.0508
EMIS_SFC, ALB_SFC = 0.999, 0.45
CZA_MIN = 0.00873
MIN_SPEED = 0.13
CONVERGENCE = 0.02
MAX_ITER = 500


def esat(tk: float) -> float:
    """Saturation vapour pressure over water (hPa), Buck (1981) with enhancement."""
    y = (tk - 273.15) / (tk - 32.18)
    return 1.004 * 6.1121 * math.exp(17.502 * y)


def dew_point_k(e_hpa: float) -> float:
    z = math.log(e_hpa / (6.1121 * 1.004))
    return 273.15 + 240.97 * z / (17.502 - z)


def viscosity(tk: float) -> float:
    sigma, eps_kappa = 3.617, 97.0
    tr = tk / eps_kappa
    omega = (tr - 2.9) / 0.4 * (-0.034) + 1.048
    return 2.6693e-6 * math.sqrt(M_AIR * tk) / (sigma * sigma * omega)


def thermal_cond(tk: float) -> float:
    return (CP + 1.25 * R_AIR) * viscosity(tk)


def diffusivity(tk: float, p_hpa: float) -> float:
    pcrit13 = (36.4 * 218.0) ** (1.0 / 3.0)
    tcrit512 = (132.0 * 647.3) ** (5.0 / 12.0)
    tcrit12 = math.sqrt(132.0 * 647.3)
    mmix = math.sqrt(1.0 / M_AIR + 1.0 / M_H2O)
    return 3.64e-4 * (tk / tcrit12) ** 2.334 * pcrit13 * tcrit512 * mmix / (p_hpa / 1013.25) * 1e-4


def evap(tk: float) -> float:
    """Latent heat of evaporation (J/kg)."""
    return (313.15 - tk) / 30.0 * (-71100.0) + 2.4073e6


def emis_atm(tk: float, rh_frac: float) -> float:
    e = rh_frac * esat(tk)
    return 0.575 * e ** 0.143


def h_sphere(tk: float, p_hpa: float, speed: float) -> float:
    density = p_hpa * 100.0 / (R_AIR * tk)
    re = max(speed, MIN_SPEED) * density * D_GLOBE / viscosity(tk)
    nu = 2.0 + 0.6 * math.sqrt(re) * PR ** 0.3333
    return nu * thermal_cond(tk) / D_GLOBE


def h_cylinder(tk: float, p_hpa: float, speed: float) -> float:
    density = p_hpa * 100.0 / (R_AIR * tk)
    re = max(speed, MIN_SPEED) * density * D_WICK / viscosity(tk)
    nu = 0.281 * re ** 0.6 * PR ** 0.44
    return nu * thermal_cond(tk) / D_WICK


def globe_temp_k(tk, rh_frac, p_hpa, speed, solar, fdir, cza) -> float:
    tsfc = tk
    tg_prev = tk
    for _ in range(MAX_ITER):
        tref = 0.5 * (tg_prev + tk)
        h = h_sphere(tref, p_hpa, speed)
        rad_term = 0.0
        if solar > 0 and cza > CZA_MIN:
            rad_term = solar / (2 * STEFANB * EMIS_GLOBE) * (1 - ALB_GLOBE) * (
                fdir * (1 / (2 * cza) - 1) + 1 + ALB_SFC)
        elif solar > 0:
            rad_term = solar / (2 * STEFANB * EMIS_GLOBE) * (1 - ALB_GLOBE) * (1 + ALB_SFC)
        val = (0.5 * (emis_atm(tk, rh_frac) * tk ** 4 + EMIS_SFC * tsfc ** 4)
               - h / (STEFANB * EMIS_GLOBE) * (tg_prev - tk) + rad_term)
        tg = max(val, 1.0) ** 0.25
        if abs(tg - tg_prev) < CONVERGENCE:
            return tg
        tg_prev = 0.9 * tg_prev + 0.1 * tg
    return tg_prev


def natural_wet_bulb_k(tk, rh_frac, p_hpa, speed, solar, fdir, cza) -> float:
    tsfc = tk
    eair = rh_frac * esat(tk)
    twb_prev = dew_point_k(eair)
    sza = math.acos(max(min(cza, 1.0), -1.0))
    tan_term = math.tan(sza) / math.pi if cza > CZA_MIN else 0.0
    for _ in range(MAX_ITER):
        tref = 0.5 * (twb_prev + tk)
        h = h_cylinder(tref, p_hpa, speed)
        fatm = (STEFANB * EMIS_WICK * (0.5 * (emis_atm(tk, rh_frac) * tk ** 4 + EMIS_SFC * tsfc ** 4)
                                       - twb_prev ** 4)
                + (1 - ALB_WICK) * solar * ((1 - fdir) * (1 + 0.25 * D_WICK / L_WICK)
                                            + fdir * (tan_term + 0.25 * D_WICK / L_WICK) + ALB_SFC))
        ewick = esat(twb_prev)
        density = p_hpa * 100.0 / (R_AIR * tref)
        sc = viscosity(tref) / (density * diffusivity(tref, p_hpa))
        twb = (tk - evap(tref) / RATIO * (ewick - eair) / (p_hpa - ewick) * (PR / sc) ** 0.56
               + fatm / h)
        if abs(twb - twb_prev) < CONVERGENCE:
            return twb
        twb_prev = 0.9 * twb_prev + 0.1 * twb
    return twb_prev


SOLAR_CONST = 1367.0
NORMSOLAR_MAX = 0.85


def estimate_fdir(solar: float, cza: float, sun_dist_au: float = 1.0):
    """Liljegren's empirical direct-beam fraction when only global solar is known.
    Returns (solar_capped, fdir)."""
    toa = SOLAR_CONST * max(0.0, cza) / (sun_dist_au ** 2)
    if cza < CZA_MIN or toa <= 0:
        return 0.0, 0.0
    norm = min(solar / toa, NORMSOLAR_MAX)
    if norm <= 0:
        return norm * toa, 0.0
    fdir = math.exp(3.0 - 1.34 * norm - 1.65 / norm)
    return norm * toa, max(min(fdir, 0.9), 0.0)


def wind_at_2m(speed_10m: float, urban: bool = True) -> float:
    p = 0.25 if urban else 0.15
    return max(speed_10m * (2.0 / 10.0) ** p, MIN_SPEED)


@dataclass
class WBGTResult:
    wbgt: float
    globe: float
    nat_wet_bulb: float
    air: float


def wbgt_outdoor(t_c: float, rh_pct: float, p_hpa: float, wind_10m: float,
                 solar_ghi: float, fdir, cza: float, urban: bool = True,
                 wind_height: float = 10.0, sun_dist_au: float = 1.0) -> WBGTResult:
    """Outdoor WBGT (deg C) in sun. For shade, pass solar_ghi=0.

    fdir=None -> estimate the direct-beam fraction with Liljegren's formula.
    wind_height=2.0 -> wind is already at 2 m (no height scaling).
    """
    tk = t_c + 273.15
    rh = max(min(rh_pct / 100.0, 1.0), 0.01)
    speed = (max(wind_10m, MIN_SPEED) if wind_height == 2.0
             else max(wind_10m * (2.0 / wind_height) ** (0.25 if urban else 0.15), MIN_SPEED))
    solar = max(solar_ghi, 0.0)
    if fdir is None:
        solar, fdir = estimate_fdir(solar, cza, sun_dist_au)
    fdir = max(min(fdir, 0.9), 0.0)
    if cza <= CZA_MIN:
        fdir = 0.0
    tg = globe_temp_k(tk, rh, p_hpa, speed, solar, fdir, cza) - 273.15
    tnwb = natural_wet_bulb_k(tk, rh, p_hpa, speed, solar, fdir, cza) - 273.15
    return WBGTResult(0.7 * tnwb + 0.2 * tg + 0.1 * t_c, tg, tnwb, t_c)
