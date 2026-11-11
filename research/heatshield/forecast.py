"""Anticipatory heat-strain forecast: "minutes until danger" and "rest needed".

Physiology-inspired roll-forward (v0). From the worker's current filter state and
recent heart rate, project heart rate under a scenario (keep working / rest in
shade) and the hourly WBGT forecast, then run the same ECTemp filter forward on
the projected heart rate. Uncertainty = conformal upper bound plus a term that
grows with the square root of the horizon.

All parameters are defaults to be FITTED on data (fit_forecast in
scripts/validate_buono.py fits drift and tau; field data should refit beta_wbgt).
Present them as such in the technical documentation.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional

from .ectemp import ECTempState, step
from .conformal import ConformalModel


@dataclass
class ForecastParams:
    tau_work: float = 8.0          # min, HR approach to target while working
    tau_rest: float = 4.0          # min, HR recovery when resting in shade
    drift_hot: float = 0.15        # bpm/min cardiovascular drift at WBGT >= 26 C
    drift_mild: float = 0.05       # bpm/min drift below that
    beta_wbgt: float = 2.0         # bpm per deg C change in WBGT
    hr_rest_shade: float = 85.0    # seated HR in shade on a hot day
    sigma_growth: float = 0.05     # deg C per sqrt(min) of horizon
    hot_wbgt: float = 26.0


def project(state: ECTempState, hr_now: float, wbgt_now: float,
            wbgt_at: Callable[[int], float], horizon: int = 60, scenario: str = "work",
            params: Optional[ForecastParams] = None, conformal: Optional[ConformalModel] = None,
            ) -> List[Dict]:
    p = params or ForecastParams()
    s = state.copy()
    hr = hr_now
    out = []
    for m in range(1, horizon + 1):
        w = wbgt_at(m)
        if scenario == "work":
            drift = p.drift_hot if w >= p.hot_wbgt else p.drift_mild
            target = hr_now + p.beta_wbgt * (w - wbgt_now) + drift * m
            hr += (target - hr) / p.tau_work
        else:  # rest in shade
            target = p.hr_rest_shade + 0.5 * p.beta_wbgt * max(0.0, w - p.hot_wbgt)
            hr += (target - hr) / p.tau_rest
        s = step(s, hr)
        up = (conformal.upper(s.ct) if conformal else s.ct + 0.5) + p.sigma_growth * math.sqrt(m)
        out.append({"minute": m, "hr": hr, "ct": s.ct, "ct_upper": up, "wbgt": w})
    return out


def minutes_to_threshold(traj: List[Dict], threshold: float = 38.5) -> Optional[int]:
    for row in traj:
        if row["ct_upper"] >= threshold:
            return row["minute"]
    return None


def rest_needed(state: ECTempState, hr_now: float, wbgt_now: float,
                wbgt_at: Callable[[int], float], threshold: float = 38.5,
                margin: float = 0.3, max_rest: int = 45,
                params: Optional[ForecastParams] = None,
                conformal: Optional[ConformalModel] = None) -> int:
    """Shortest shaded rest (minutes, steps of 5) that brings the upper bound
    below threshold - margin. Returns max_rest if not reached."""
    traj = project(state, hr_now, wbgt_now, wbgt_at, max_rest, "rest", params, conformal)
    for row in traj:
        if row["minute"] % 5 == 0 and row["ct_upper"] < threshold - margin:
            return row["minute"]
    return max_rest
