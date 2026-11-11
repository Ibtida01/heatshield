# Validation: Buono heat-tolerance dataset (Mendeley, CC BY 4.0)

Subjects: 65 · minutes analysed: 13000 · burn-in excluded: 5 min · start value: default

| Agreement | n | Bias (°C) | SD | RMSE | MAE | 95% limits of agreement |
|---|---|---|---|---|---|---|
| All | 13000 | 0.03 | 0.46 | 0.46 | 0.36 | -0.87 to 0.92 |
| heat | 5652 | 0.05 | 0.47 | 0.47 | 0.35 | -0.86 to 0.97 |
| neutral | 7348 | 0.01 | 0.45 | 0.45 | 0.36 | -0.87 to 0.89 |

Conformal upper bound (target 90%, 50 random subject splits): mean coverage 90.8% (worst 81.4%), mean margin 0.51 °C, coverage when measured ≥ 38.5 °C: 72.3%

| Alarm rule | Positives | Sensitivity | Specificity | PPV |
|---|---|---|---|---|
| estimate_ge_38_5 | 1045 | 65.7% | 87.3% | 31.1% |
| upper_bound_ge_38_5 | 1045 | 84.6% | 71.6% | 20.7% |
| estimate_ge_38_0 | 6025 | 68.0% | 79.3% | 73.9% |
| upper_bound_ge_38_0 | 6025 | 98.2% | 24.9% | 53.0% |

Forecast fit: drift 0.0 bpm/min, tau 4.0 min

| Horizon | MAE (°C) | Bias | Upper-bound coverage | n |
|---|---|---|---|---|
| +15min | 0.34 | 0.04 | 97.6% | 1513 |
| +30min | 0.36 | 0.08 | 98.1% | 1513 |
