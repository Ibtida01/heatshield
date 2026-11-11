# Validation: Buono HTT, start from measured temperature

Subjects: 65 · minutes analysed: 13000 · burn-in excluded: 5 min · start value: measured

| Agreement | n | Bias (°C) | SD | RMSE | MAE | 95% limits of agreement |
|---|---|---|---|---|---|---|
| All | 13000 | 0.06 | 0.43 | 0.43 | 0.32 | -0.77 to 0.90 |
| heat | 5652 | 0.09 | 0.43 | 0.43 | 0.30 | -0.74 to 0.92 |
| neutral | 7348 | 0.05 | 0.43 | 0.43 | 0.33 | -0.79 to 0.88 |

Conformal upper bound (target 90%, 50 random subject splits): mean coverage 90.5% (worst 81.5%), mean margin 0.42 °C, coverage when measured ≥ 38.5 °C: 75.2%

| Alarm rule | Positives | Sensitivity | Specificity | PPV |
|---|---|---|---|---|
| estimate_ge_38_5 | 1045 | 70.5% | 86.4% | 31.3% |
| upper_bound_ge_38_5 | 1045 | 83.7% | 76.2% | 23.5% |
| estimate_ge_38_0 | 6025 | 73.5% | 78.1% | 74.3% |
| upper_bound_ge_38_0 | 6025 | 98.1% | 23.9% | 52.7% |
