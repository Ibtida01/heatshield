"""Validate the HeatShield core-temperature estimator and export the app calibration.

Step 1 - look at the file you downloaded:
    python scripts/validate_buono.py inspect data/buono/<file>

Step 2 - run validation (map the column names you saw in step 1):
    python scripts/validate_buono.py run data/buono/<file> \
        --subject-col Subject --time-col Time --hr-col HR --tc-col Tc \
        --condition-col Condition --time-unit minutes

    If every sheet of an Excel file is one subject, add --sheet-per-subject.

Pipeline test without real data:
    python scripts/make_synthetic.py
    python scripts/validate_buono.py run data/synthetic_hr_tc.csv --synthetic \
        --subject-col subject --time-col minute --hr-col hr --tc-col tc --condition-col condition

Outputs (results/): metrics.json, metrics.md, bland_altman.png, traces.png,
error_by_bin.png, forecast.png; and ../app/model/calibration.json for the app.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import date

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from heatshield import ectemp  # noqa: E402
from heatshield.conformal import ConformalModel  # noqa: E402
from heatshield.forecast import ForecastParams, project  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
if hasattr(sys.stdout, "reconfigure"):  # Windows consoles default to cp1252
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
RESULTS = os.path.join(HERE, "..", "results")
APP_MODEL = os.path.join(HERE, "..", "..", "app", "model", "calibration.json")


# ---------------------------------------------------------------- loading
def read_any(path, sheet=None):
    if path.lower().endswith((".xlsx", ".xls")):
        return pd.read_excel(path, sheet_name=sheet if sheet is not None else None)
    return {"csv": pd.read_csv(path)}


def cmd_inspect(a):
    data = read_any(a.path)
    for name, df in data.items():
        print(f"\n=== sheet: {name}  shape={df.shape}")
        print("columns:", list(df.columns))
        print(df.head(8).to_string())


def load_long(a) -> pd.DataFrame:
    sheets = read_any(a.path, a.sheet)
    if isinstance(sheets, pd.DataFrame):
        sheets = {a.sheet: sheets}
    frames = []
    for name, df in sheets.items():
        df = df.copy()
        if a.sheet_per_subject:
            df["__subject"] = str(name)
        else:
            if a.subject_col not in df.columns:
                continue
            df["__subject"] = df[a.subject_col].astype(str)
        missing = [c for c in (a.time_col, a.hr_col, a.tc_col) if c not in df.columns]
        if missing:
            print(f"sheet {name}: missing columns {missing}; skipped")
            continue
        out = pd.DataFrame({
            "subject": df["__subject"],
            "condition": df[a.condition_col].astype(str) if a.condition_col and a.condition_col in df.columns else "all",
            "t": pd.to_numeric(df[a.time_col], errors="coerce"),
            "hr": pd.to_numeric(df[a.hr_col], errors="coerce"),
            "tc": pd.to_numeric(df[a.tc_col], errors="coerce"),
        })
        frames.append(out)
    if not frames:
        sys.exit("No usable data. Run 'inspect' and check the column names.")
    d = pd.concat(frames, ignore_index=True).dropna(subset=["t"])
    if a.time_unit == "seconds":
        d["t"] = d["t"] / 60.0
    elif a.time_unit == "hours":
        d["t"] = d["t"] * 60.0
    # 1-minute means per subject-condition session
    d["minute"] = np.floor(d["t"] - d.groupby(["subject", "condition"])["t"].transform("min")).astype(int)
    d = (d.groupby(["subject", "condition", "minute"], as_index=False)[["hr", "tc"]].mean()
           .sort_values(["subject", "condition", "minute"]))
    return d


# ---------------------------------------------------------------- estimation
def run_filter(d: pd.DataFrame, ct0_mode: str) -> pd.DataFrame:
    parts = []
    for (s, c), g in d.groupby(["subject", "condition"]):
        g = g.set_index("minute").reindex(range(int(g.minute.max()) + 1))
        g["subject"], g["condition"] = s, c
        ct0 = ectemp.CT0
        if ct0_mode == "measured" and g["tc"].notna().any():
            ct0 = float(g["tc"].dropna().iloc[0])
        hr = [None if not np.isfinite(h) else float(h) for h in g["hr"].to_numpy()]
        est, var = ectemp.run(hr, ct0=ct0)
        g["ct_est"], g["ct_var"] = est, var
        parts.append(g.reset_index().rename(columns={"index": "minute"}))
    return pd.concat(parts, ignore_index=True)


def agreement(true, est):
    e = np.asarray(est) - np.asarray(true)
    bias, sd = float(np.mean(e)), float(np.std(e, ddof=1))
    return {"n": int(len(e)), "bias": bias, "sd": sd, "rmse": float(np.sqrt(np.mean(e ** 2))),
            "mae": float(np.mean(np.abs(e))), "loa_low": bias - 1.96 * sd, "loa_high": bias + 1.96 * sd}


def detection(true, score, thr):
    t, p = np.asarray(true) >= thr, np.asarray(score) >= thr
    tp, fn, fp, tn = int((t & p).sum()), int((t & ~p).sum()), int((~t & p).sum()), int((~t & ~p).sum())
    sens = tp / (tp + fn) if tp + fn else float("nan")
    spec = tn / (tn + fp) if tn + fp else float("nan")
    ppv = tp / (tp + fp) if tp + fp else float("nan")
    return {"threshold": thr, "positives": tp + fn, "sensitivity": sens, "specificity": spec, "ppv": ppv}


def conformal_eval(df, alpha, reps=50, seed=0):
    rng = np.random.default_rng(seed)
    subjects = df.subject.unique()
    cov, width, cov_hot = [], [], []
    for _ in range(reps):
        perm = rng.permutation(subjects)
        cal = set(perm[: len(perm) // 2])
        a, b = df[df.subject.isin(cal)], df[~df.subject.isin(cal)]
        m = ConformalModel(alpha=alpha).fit(a.ct_est, a.tc)
        up = np.array([m.upper(x) for x in b.ct_est])
        cov.append(float(np.mean(b.tc <= up)))
        width.append(float(np.mean(up - b.ct_est)))
        hot = b.tc >= 38.5
        if hot.any():
            cov_hot.append(float(np.mean(b.tc[hot] <= up[hot])))
    return {"target_coverage": 1 - alpha, "mean_coverage": float(np.mean(cov)),
            "min_coverage": float(np.min(cov)), "mean_margin_c": float(np.mean(width)),
            "coverage_when_true_ge_38_5": float(np.mean(cov_hot)) if cov_hot else None,
            "splits": reps}


# ---------------------------------------------------------------- forecast
def forecast_eval(df, conf, params, horizons=(15, 30), every=5):
    errs = {h: [] for h in horizons}
    covs = {h: [] for h in horizons}
    for (s, c), g in df.groupby(["subject", "condition"]):
        g = g.dropna(subset=["hr", "tc"]).set_index("minute")
        if len(g) < 40:
            continue
        hr = [float(x) for x in g.hr]
        mins = list(g.index)
        st = ectemp.ECTempState(ectemp.CT0, 0.0)
        states = []
        for x in hr:
            st = ectemp.step(st, x)
            states.append(st.copy())
        for i in range(15, len(mins) - max(horizons), every):
            hr_now = float(np.mean(hr[i - 4:i + 1]))
            traj = project(states[i], hr_now, 30.0, lambda m: 30.0, max(horizons), "work", params, conf)
            for h in horizons:
                j = i + h
                if j < len(mins):
                    errs[h].append(traj[h - 1]["ct"] - float(g.tc.iloc[j]))
                    covs[h].append(float(g.tc.iloc[j]) <= traj[h - 1]["ct_upper"])
    return {f"+{h}min": {"mae": float(np.mean(np.abs(errs[h]))) if errs[h] else None,
                         "bias": float(np.mean(errs[h])) if errs[h] else None,
                         "upper_coverage": float(np.mean(covs[h])) if covs[h] else None,
                         "n": len(errs[h])} for h in horizons}


def fit_forecast(df, conf):
    best = None
    for drift in (0.0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5):
        for tau in (4.0, 8.0, 12.0):
            p = ForecastParams(drift_hot=drift, drift_mild=drift, tau_work=tau)
            r = forecast_eval(df, conf, p, horizons=(30,), every=10)["+30min"]
            if r["mae"] is not None and (best is None or r["mae"] < best[0]):
                best = (r["mae"], drift, tau)
    return best


# ---------------------------------------------------------------- plots
def plots(df, out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    ok = df.dropna(subset=["tc", "ct_est"])
    mean, diff = (ok.tc + ok.ct_est) / 2, ok.ct_est - ok.tc
    b, s = diff.mean(), diff.std()
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.scatter(mean, diff, s=3, alpha=0.3)
    for y, ls in ((b, "-"), (b + 1.96 * s, "--"), (b - 1.96 * s, "--")):
        ax.axhline(y, ls=ls, c="k", lw=1)
    ax.set_xlabel("Mean of measured and estimated core temp (°C)")
    ax.set_ylabel("Estimated − measured (°C)")
    ax.set_title("Bland–Altman: HR-based estimate vs measured")
    fig.tight_layout(); fig.savefig(os.path.join(out, "bland_altman.png"), dpi=150); plt.close(fig)

    fig, axes = plt.subplots(2, 3, figsize=(11, 6), sharey=True)
    for ax, ((sub, cond), g) in zip(axes.flat, list(ok.groupby(["subject", "condition"]))[:6]):
        ax.plot(g.minute, g.tc, label="measured")
        ax.plot(g.minute, g.ct_est, label="estimate")
        if "ct_upper" in g:
            ax.plot(g.minute, g.ct_upper, ls=":", label="upper bound")
        ax.axhline(38.5, c="r", lw=0.8)
        ax.set_title(f"{sub} · {cond}", fontsize=9)
    axes.flat[0].legend(fontsize=7)
    fig.supxlabel("Minute"); fig.supylabel("Core temperature (°C)")
    fig.tight_layout(); fig.savefig(os.path.join(out, "traces.png"), dpi=150); plt.close(fig)

    bins = pd.cut(ok.tc, [35, 37.5, 38.0, 38.5, 39.0, 41])
    g = ok.assign(err=diff).groupby(bins, observed=True)["err"]
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.bar([str(i) for i in g.mean().index], g.mean().values, yerr=g.std().values, capsize=3)
    ax.axhline(0, c="k", lw=0.8)
    ax.set_xlabel("Measured core temperature bin (°C)"); ax.set_ylabel("Mean error (°C)")
    ax.set_title("Error by temperature range (negative = underestimates)")
    fig.tight_layout(); fig.savefig(os.path.join(out, "error_by_bin.png"), dpi=150); plt.close(fig)


# ---------------------------------------------------------------- main
def cmd_run(a):
    os.makedirs(RESULTS, exist_ok=True)
    d = load_long(a)
    df = run_filter(d, a.ct0)
    ok = df.dropna(subset=["tc", "hr", "ct_est"])
    ok = ok[ok.minute >= a.burn_in]
    print(f"subjects={ok.subject.nunique()} sessions={ok.groupby(['subject','condition']).ngroups} minutes={len(ok)}")

    metrics = {"dataset": a.name or os.path.basename(a.path), "synthetic": a.synthetic,
               "subjects": int(ok.subject.nunique()), "minutes": int(len(ok)), "burn_in_min": a.burn_in,
               "ct0_mode": a.ct0, "agreement_all": agreement(ok.tc, ok.ct_est)}
    metrics["agreement_by_condition"] = {c: agreement(g.tc, g.ct_est) for c, g in ok.groupby("condition")}
    metrics["conformal_eval"] = conformal_eval(ok, a.alpha)

    conf = ConformalModel(alpha=a.alpha).fit(ok.ct_est, ok.tc)
    df["ct_upper"] = [conf.upper(x) if np.isfinite(x) else np.nan for x in df.ct_est]
    ok = df.dropna(subset=["tc", "hr", "ct_est"])
    ok = ok[ok.minute >= a.burn_in]
    metrics["detection"] = {
        "estimate_ge_38_5": detection(ok.tc, ok.ct_est, 38.5),
        "upper_bound_ge_38_5": detection(ok.tc, ok.ct_upper, 38.5),
        "estimate_ge_38_0": detection(ok.tc, ok.ct_est, 38.0),
        "upper_bound_ge_38_0": detection(ok.tc, ok.ct_upper, 38.0),
    }
    best = fit_forecast(ok, conf) if not a.skip_forecast else None
    params = ForecastParams(drift_hot=best[1], drift_mild=best[1], tau_work=best[2]) if best else ForecastParams()
    if not a.skip_forecast:
        metrics["forecast_fit"] = {"drift_bpm_per_min": params.drift_hot, "tau_work_min": params.tau_work,
                                   "note": "fitted on the same subjects; cross-validate before reporting"}
        metrics["forecast_eval"] = forecast_eval(ok, conf, params)

    with open(os.path.join(RESULTS, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, default=float)
    write_markdown(metrics, os.path.join(RESULTS, "metrics.md"))
    plots(df, RESULTS)

    os.makedirs(os.path.dirname(APP_MODEL), exist_ok=True)
    conf.save(APP_MODEL, extra={
        "source": metrics["dataset"], "synthetic": a.synthetic, "subjects": metrics["subjects"],
        "minutes": metrics["minutes"], "created": date.today().isoformat(),
        "test_coverage": metrics["conformal_eval"]["mean_coverage"],
        "forecast": {"drift_hot": params.drift_hot, "drift_mild": params.drift_mild,
                     "tau_work": params.tau_work, "tau_rest": params.tau_rest,
                     "beta_wbgt": params.beta_wbgt, "sigma_growth": params.sigma_growth},
    })
    print(open(os.path.join(RESULTS, "metrics.md"), encoding="utf-8").read())
    print("App calibration written to", os.path.normpath(APP_MODEL))


def write_markdown(m, path):
    A = m["agreement_all"]
    L = [f"# Validation: {m['dataset']}" + ("  (SYNTHETIC — do not report)" if m["synthetic"] else ""), "",
         f"Subjects: {m['subjects']} · minutes analysed: {m['minutes']} · burn-in excluded: {m['burn_in_min']} min · start value: {m['ct0_mode']}", "",
         "| Agreement | n | Bias (°C) | SD | RMSE | MAE | 95% limits of agreement |", "|---|---|---|---|---|---|---|",
         f"| All | {A['n']} | {A['bias']:.2f} | {A['sd']:.2f} | {A['rmse']:.2f} | {A['mae']:.2f} | {A['loa_low']:.2f} to {A['loa_high']:.2f} |"]
    for c, B in m["agreement_by_condition"].items():
        L.append(f"| {c} | {B['n']} | {B['bias']:.2f} | {B['sd']:.2f} | {B['rmse']:.2f} | {B['mae']:.2f} | {B['loa_low']:.2f} to {B['loa_high']:.2f} |")
    C = m["conformal_eval"]
    L += ["", f"Conformal upper bound (target {C['target_coverage']:.0%}, {C['splits']} random subject splits): "
              f"mean coverage {C['mean_coverage']:.1%} (worst {C['min_coverage']:.1%}), mean margin {C['mean_margin_c']:.2f} °C"
              + (f", coverage when measured ≥ 38.5 °C: {C['coverage_when_true_ge_38_5']:.1%}" if C['coverage_when_true_ge_38_5'] is not None else ""),
          "", "| Alarm rule | Positives | Sensitivity | Specificity | PPV |", "|---|---|---|---|---|"]
    for k, D in m["detection"].items():
        L.append(f"| {k} | {D['positives']} | {D['sensitivity']:.1%} | {D['specificity']:.1%} | {D['ppv']:.1%} |")
    if "forecast_eval" in m:
        L += ["", f"Forecast fit: drift {m['forecast_fit']['drift_bpm_per_min']} bpm/min, tau {m['forecast_fit']['tau_work_min']} min",
              "", "| Horizon | MAE (°C) | Bias | Upper-bound coverage | n |", "|---|---|---|---|---|"]
        for h, F in m["forecast_eval"].items():
            if F["mae"] is not None:
                L.append(f"| {h} | {F['mae']:.2f} | {F['bias']:.2f} | {F['upper_coverage']:.1%} | {F['n']} |")
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("inspect"); i.add_argument("path")
    r = sub.add_parser("run"); r.add_argument("path")
    r.add_argument("--subject-col", default="subject"); r.add_argument("--time-col", default="minute")
    r.add_argument("--hr-col", default="hr"); r.add_argument("--tc-col", default="tc")
    r.add_argument("--condition-col", default=None); r.add_argument("--sheet", default=None)
    r.add_argument("--sheet-per-subject", action="store_true")
    r.add_argument("--time-unit", choices=["minutes", "seconds", "hours"], default="minutes")
    r.add_argument("--ct0", choices=["default", "measured"], default="default",
                   help="default = 37.1 C as in Buller 2013; measured = first measured value")
    r.add_argument("--burn-in", type=int, default=5)
    r.add_argument("--alpha", type=float, default=0.1)
    r.add_argument("--name", default=None); r.add_argument("--synthetic", action="store_true")
    r.add_argument("--skip-forecast", action="store_true")
    a = ap.parse_args()
    cmd_inspect(a) if a.cmd == "inspect" else cmd_run(a)


if __name__ == "__main__":
    main()
