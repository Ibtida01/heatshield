"""External test on the Priego-Quesada cycling-ramp dataset (BodyCap pill + Calera sensor), CC BY 4.0.

Uses the calibration fitted on the Buono data (app/model/calibration.json) without refitting.
python research/scripts/external_calera.py --data research/data/calera_long.csv
"""
import argparse, json, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from heatshield import ectemp  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(); ap.add_argument("--data", required=True)
ap.add_argument("--calibration", default=os.path.join(HERE, "..", "..", "app", "model", "calibration.json"))
a = ap.parse_args()
cal = json.load(open(a.calibration, encoding="utf-8"))
edges = [-np.inf if e is None and i == 0 else (np.inf if e is None else e) for i, e in enumerate(cal["edges"])]
def upper(ct):
    for i in range(len(edges) - 1):
        if edges[i] <= ct < edges[i + 1]:
            return ct + cal["q_upper"][i]
    return ct + cal["q_upper"][-1]

d = pd.read_csv(a.data)
rows = []
for s, g in d.groupby("subject"):
    g = g.sort_values("minute")
    grid = np.arange(0, int(np.ceil(g.minute.max())) + 1)
    hr = np.interp(grid, g.minute, g.hr)                 # 1-minute heart rate from the 10 test points
    est, _ = ectemp.run(list(hr))
    e_at = np.interp(g.minute, grid, est)
    for (_, r), e in zip(g.iterrows(), e_at):
        rows.append({"subject": s, "pct": r.test_pct, "tc": r.tc, "hr_est": e, "hr_upper": upper(e), "calera": r.calera})
r = pd.DataFrame(rows)
def stats(err):
    return {"bias": float(err.mean()), "rmse": float(np.sqrt((err ** 2).mean())), "mae": float(err.abs().mean())}
out = {"dataset": "Priego-Quesada et al. 2025, cycling ramp, BodyCap pill (Mendeley, CC BY 4.0)",
       "people": int(r.subject.nunique()), "points": int(len(r)),
       "heart_rate_method": stats(r.hr_est - r.tc), "calera_sensor": stats(r.calera - r.tc),
       "upper_bound_coverage": float((r.tc <= r.hr_upper).mean()),
       "heart_rate_method_by_stage": {int(k): stats(v.hr_est - v.tc)["bias"] for k, v in r.groupby("pct")}}
os.makedirs(os.path.join(HERE, "..", "results"), exist_ok=True)
json.dump(out, open(os.path.join(HERE, "..", "results", "external_calera.json"), "w", encoding="utf-8"), indent=2)
print(json.dumps(out, indent=2))
