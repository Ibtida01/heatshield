"""Convert the two downloaded Excel files to the long format validate_buono.py reads.

python research/scripts/convert_datasets.py \
    --htt "data/buono/HTT data set.xlsx" \
    --calera "data/Jose Ignacio Priego-Quesada/dataset.xlsx" \
    --out research/data

Writes:
  htt_long.csv     subject, condition (heat/neutral), minute, hr, tc   (Buono, 2 h treadmill)
  calera_long.csv  subject, minute, hr, tc (BodyCap pill), calera, test_pct   (Priego-Quesada, cycling ramp)
  cleaning_log.txt what was removed and why

Cleaning (state it in the documentation):
  - core temperature outside 35.5-41.0 C removed
  - single-minute spikes removed: |Tc - centred 5-min rolling median| > 0.30 C (pill signal drops)
  - heart rate outside 40-220 bpm removed
"""
import argparse
import os

import numpy as np
import pandas as pd


def htt_sheet(df: pd.DataFrame, condition: str) -> pd.DataFrame:
    minutes = pd.to_numeric(df.iloc[2, 2:123], errors="coerce").to_numpy()
    rows = []
    r = 3
    while r < len(df):
        sid, label = df.iloc[r, 0], str(df.iloc[r, 1]).strip().lower()
        if pd.notna(sid) and label.startswith("temp") and r + 1 < len(df):
            tc = pd.to_numeric(df.iloc[r, 2:123], errors="coerce").to_numpy()
            hr = pd.to_numeric(df.iloc[r + 1, 2:123], errors="coerce").to_numpy()
            method = df.iloc[r, 123] if df.shape[1] > 123 else None
            for m, t, h in zip(minutes, tc, hr):
                if np.isfinite(m):
                    rows.append((f"H{int(sid):02d}", condition, int(m), h, t, method))
            r += 3
        else:
            r += 1
    return pd.DataFrame(rows, columns=["subject", "condition", "minute", "hr", "tc", "temp_method"])


def clean(d: pd.DataFrame, log: list, name: str) -> pd.DataFrame:
    d = d.copy()
    n0 = d.tc.notna().sum()
    d.loc[(d.tc < 35.5) | (d.tc > 41.0), "tc"] = np.nan
    n1 = d.tc.notna().sum()
    keys = [k for k in ("subject", "condition") if k in d]
    med = d.groupby(keys)["tc"].transform(lambda s: s.rolling(5, center=True, min_periods=3).median())
    spike = (d.tc - med).abs() > 0.30
    d.loc[spike, "tc"] = np.nan
    n2 = d.tc.notna().sum()
    hr_bad = (d.hr < 40) | (d.hr > 220)
    d.loc[hr_bad, "hr"] = np.nan
    log.append(f"{name}: core temp out of range removed {n0 - n1}, spikes removed {n1 - n2}, "
               f"heart rate out of range removed {int(hr_bad.sum())}, sessions {d.groupby(keys).ngroups}")
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--htt", required=True); ap.add_argument("--calera")
    ap.add_argument("--out", default="research/data")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    log = []
    sheets = pd.read_excel(a.htt, sheet_name=None, header=None)
    parts = []
    for name, df in sheets.items():
        n = name.lower()
        if "treadmill" in n:
            parts.append(htt_sheet(df, "heat" if "heat" in n else "neutral"))
    htt = clean(pd.concat(parts, ignore_index=True), log, "HTT")
    htt.to_csv(os.path.join(a.out, "htt_long.csv"), index=False)
    log.append(f"HTT: {htt.subject.nunique()} people, temperature methods {htt.temp_method.value_counts().to_dict()}")

    if a.calera:
        c = pd.read_excel(a.calera)
        c = c.sort_values(["ID", "Test_percentage"])
        c["minute"] = c.Test_percentage / 100.0 * c.Testduration
        cal = pd.DataFrame({"subject": "C" + c.ID.astype(int).astype(str).str.zfill(2), "condition": "ramp",
                            "minute": c.minute, "hr": c.HR, "tc": c.BodyCap, "calera": c.Core_calera,
                            "test_pct": c.Test_percentage, "sex": c.Sex, "group": c.Group})
        cal.to_csv(os.path.join(a.out, "calera_long.csv"), index=False)
        log.append(f"Calera: {cal.subject.nunique()} people, {len(cal)} points, ramp to exhaustion "
                   f"(median {c.Testduration.median():.1f} min)")
    open(os.path.join(a.out, "cleaning_log.txt"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log))


if __name__ == "__main__":
    main()
