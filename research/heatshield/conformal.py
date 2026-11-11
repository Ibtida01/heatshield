"""Stratified split-conformal intervals for estimated core temperature.

Residual r = true_ct - estimated_ct, collected on CALIBRATION subjects that the
estimator never saw. Within each estimated-CT bin we take finite-sample-corrected
quantiles, so the interval widens where the estimator is weakest (high CT).

HeatShield alerts on the one-sided UPPER bound: ct_est + q_upper, because a
missed hot worker is worse than an early rest break.

Caveat: time points from the same subject are correlated, so exact conformal
exchangeability does not hold; always report empirical coverage on held-out
TEST subjects (validate_buono.py does this).
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Dict, List, Sequence

import numpy as np

DEFAULT_EDGES = [-math.inf, 37.5, 38.0, 38.5, math.inf]


def _cq(x: np.ndarray, level: float) -> float:
    """Finite-sample conformal quantile at `level` (0..1)."""
    n = len(x)
    if n == 0:
        return float("nan")
    k = math.ceil((n + 1) * level)
    k = min(max(k, 1), n)
    return float(np.sort(x)[k - 1])


@dataclass
class ConformalModel:
    alpha: float = 0.1
    edges: List[float] = field(default_factory=lambda: list(DEFAULT_EDGES))
    q_upper: List[float] = field(default_factory=list)   # one-sided (1-alpha)
    q_lo: List[float] = field(default_factory=list)      # two-sided alpha/2
    q_hi: List[float] = field(default_factory=list)      # two-sided 1-alpha/2
    n: List[int] = field(default_factory=list)
    floor: bool = True                                   # see fit()

    def fit(self, ct_est: Sequence[float], ct_true: Sequence[float], min_n: int = 30):
        est = np.asarray(ct_est, float)
        res = np.asarray(ct_true, float) - est
        g_up = _cq(res, 1 - self.alpha)
        g_lo = -_cq(-res, 1 - self.alpha / 2)
        g_hi = _cq(res, 1 - self.alpha / 2)
        self.q_upper, self.q_lo, self.q_hi, self.n = [], [], [], []
        for lo, hi in zip(self.edges[:-1], self.edges[1:]):
            m = (est >= lo) & (est < hi)
            r = res[m]
            self.n.append(int(m.sum()))
            if m.sum() >= min_n:
                # safety floor: no band may get a smaller upper margin than the overall one
                self.q_upper.append(max(_cq(r, 1 - self.alpha), g_up) if self.floor else _cq(r, 1 - self.alpha))
                self.q_lo.append(-_cq(-r, 1 - self.alpha / 2))
                self.q_hi.append(_cq(r, 1 - self.alpha / 2))
            else:  # too few points: fall back to the global quantile
                self.q_upper.append(g_up)
                self.q_lo.append(g_lo)
                self.q_hi.append(g_hi)
        return self

    def _bin(self, ct: float) -> int:
        for i, (lo, hi) in enumerate(zip(self.edges[:-1], self.edges[1:])):
            if lo <= ct < hi:
                return i
        return len(self.edges) - 2

    def upper(self, ct_est: float) -> float:
        return ct_est + self.q_upper[self._bin(ct_est)]

    def interval(self, ct_est: float):
        i = self._bin(ct_est)
        return ct_est + self.q_lo[i], ct_est + self.q_hi[i]

    def to_json(self) -> Dict:
        enc = lambda v: None if (isinstance(v, float) and math.isinf(v)) else v
        return {"alpha": self.alpha, "floor": self.floor, "edges": [enc(e) for e in self.edges],
                "q_upper": self.q_upper, "q_lo": self.q_lo, "q_hi": self.q_hi, "n": self.n}

    def save(self, path: str, extra: Dict | None = None):
        d = self.to_json()
        if extra:
            d.update(extra)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2)
