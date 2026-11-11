"""Generate a SYNTHETIC heart-rate + core-temperature dataset for pipeline testing.

The numbers are invented. Never report results from this file; use it only to
check that validate_buono.py runs end to end before you have the real data.

Output: long-format CSV with columns subject, condition, minute, hr, tc.
"""
import argparse

import numpy as np
import pandas as pd


def simulate(n_subjects=40, minutes=120, seed=7):
    rng = np.random.default_rng(seed)
    rows = []
    for s in range(n_subjects):
        fitness = rng.normal(0, 1)
        hr_offset = rng.normal(0, 8) - 4 * fitness
        for cond in ("hot", "neutral"):
            tc = rng.normal(37.0, 0.2)
            plateau = (38.9 if cond == "hot" else 38.1) + rng.normal(0, 0.3) - 0.15 * fitness
            k = rng.uniform(0.02, 0.04)
            for m in range(minutes):
                tc += k * (plateau - tc) + rng.normal(0, 0.01)
                # HR follows core temperature plus exercise load, offset and noise
                hr = (-4.5714 * tc ** 2 + 384.4286 * tc - 7887.1) + hr_offset \
                    + (6 if cond == "hot" else 0) + 0.05 * m + rng.normal(0, 4)
                rows.append((f"S{s+1:02d}", cond, m, round(hr, 1), round(tc, 3)))
    return pd.DataFrame(rows, columns=["subject", "condition", "minute", "hr", "tc"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/synthetic_hr_tc.csv")
    ap.add_argument("--subjects", type=int, default=40)
    a = ap.parse_args()
    import os
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    simulate(a.subjects).to_csv(a.out, index=False)
    print("wrote", a.out, "(SYNTHETIC - for testing only)")
