"""Kidney heat-load ledger (research index v0, NOT clinically validated).

Repeated days of high heat strain plus under-hydration are linked to acute
kidney injury in outdoor workers. This ledger turns each monitored shift into a
daily dose and flags workers who should get a simple kidney check (serum
creatinine + urinalysis). The thresholds below are starting points to agree
with your clinical lead and to test in the field study (Paper A).

Urine colour uses the 8-point Armstrong chart (1 = pale, 8 = dark);
6 or more is commonly read as dehydrated.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class Thresholds:
    hot_ct: float = 38.0          # deg C used for degree-minutes
    red_degmin: float = 30.0
    amber_degmin: float = 10.0
    red_psi_min: int = 30
    amber_psi_min: int = 10
    dark_urine: int = 6
    flag_red_days: int = 3        # in the last 7 days
    flag_dark_urine_days: int = 2  # consecutive


@dataclass
class DayRecord:
    date: str
    minutes: int = 0
    degmin: float = 0.0           # sum over minutes of max(0, ct - hot_ct)
    psi_high_min: int = 0         # minutes with PSI >= 7
    max_ct: float = 0.0
    urine_colour: Optional[int] = None
    water_breaks: int = 0

    def add_minute(self, ct: float, psi_value: float, th: Thresholds = Thresholds()):
        self.minutes += 1
        self.degmin += max(0.0, ct - th.hot_ct)
        if psi_value >= 7:
            self.psi_high_min += 1
        self.max_ct = max(self.max_ct, ct)


def classify(day: DayRecord, th: Thresholds = Thresholds()) -> str:
    if (day.degmin >= th.red_degmin or day.psi_high_min >= th.red_psi_min
            or (day.urine_colour or 0) >= th.dark_urine):
        return "red"
    if (day.degmin >= th.amber_degmin or day.psi_high_min >= th.amber_psi_min
            or (day.urine_colour or 0) >= 4):
        return "amber"
    return "green"


def kidney_flag(days: List[DayRecord], th: Thresholds = Thresholds()) -> Tuple[bool, str]:
    last7 = days[-7:]
    reds = sum(classify(d, th) == "red" for d in last7)
    if reds >= th.flag_red_days:
        return True, f"{reds} high-strain days in the last 7"
    run = 0
    for d in last7:
        run = run + 1 if (d.urine_colour or 0) >= th.dark_urine else 0
        if run >= th.flag_dark_urine_days:
            return True, f"dark urine on {run} days in a row"
    return False, ""
