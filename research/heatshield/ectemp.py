"""Core body temperature (CBT) estimation from heart rate.

Extended Kalman filter after Buller MJ, Tharion WJ, Cheuvront SN, et al.
"Estimation of human core temperature from sequential heart rate observations."
Physiological Measurement 34 (2013) 781-798. Often called ECTemp.

Inputs are 1-minute mean heart rates (bpm). Output is estimated CBT (deg C)
and the filter variance. The published model was developed on soldiers and
athletes; HeatShield treats it as a baseline that must be recalibrated
(see conformal.py) and validated in the target population.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

# Model constants from Buller et al. (2013)
A = 1.0                 # state transition (random walk)
GAMMA = 0.022           # process noise SD per minute (deg C)
B0, B1, B2 = -7887.1, 384.4286, -4.5714   # HR = B2*CT^2 + B1*CT + B0
SIGMA = 18.88           # observation noise SD (bpm)
CT0 = 37.1              # default starting CBT (deg C)
V0 = 0.0                # default starting variance


def hr_from_ct(ct: float) -> float:
    """Observation model: expected heart rate for a given core temperature."""
    return B2 * ct * ct + B1 * ct + B0


def ct_from_hr(hr: float) -> float:
    """Inverse of the observation model on the physiological branch (CT < 42 C).

    Useful as the 'equilibrium' CBT implied by a sustained heart rate.
    """
    disc = B1 * B1 - 4.0 * B2 * (B0 - hr)
    disc = max(disc, 0.0)
    return (-B1 + math.sqrt(disc)) / (2.0 * B2)


@dataclass
class ECTempState:
    ct: float = CT0
    v: float = V0

    def copy(self) -> "ECTempState":
        return ECTempState(self.ct, self.v)


def step(state: ECTempState, hr: Optional[float]) -> ECTempState:
    """One 1-minute filter step. hr=None (missing beat data) -> predict only."""
    ct_pred = A * state.ct
    v_pred = A * state.v * A + GAMMA * GAMMA
    if hr is None or not math.isfinite(hr):
        return ECTempState(ct_pred, v_pred)
    c = 2.0 * B2 * ct_pred + B1
    k = (v_pred * c) / (c * c * v_pred + SIGMA * SIGMA)
    ct_new = ct_pred + k * (hr - hr_from_ct(ct_pred))
    v_new = (1.0 - k * c) * v_pred
    return ECTempState(ct_new, v_new)


def run(hr_series: Iterable[Optional[float]], ct0: float = CT0, v0: float = V0
        ) -> Tuple[List[float], List[float]]:
    """Run the filter over a 1-minute HR series. Returns (ct_estimates, variances)."""
    s = ECTempState(ct0, v0)
    cts, vs = [], []
    for hr in hr_series:
        s = step(s, hr)
        cts.append(s.ct)
        vs.append(s.v)
    return cts, vs
