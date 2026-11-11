# HeatShield: technical documentation

Future Health Digital Innovation Challenge 2026. Focus area: Wellbeing. Challenge statement: climate-resilient worker health.
Team: <Team_LoneWolf,Bangladesh>. Contact: <ibtida01.ahmed@gmail.com>. Prototype: <https://ibtida01.github.io/heatshield/app/>. Code: <[GitHub link](https://github.com/Ibtida01/heatshield.git)>.

## 1. Problem

Outdoor workers in the Gulf face extreme heat for months each year. Fixed rules such as the UAE midday break (12:30 to 15:00, 15 June to 15 September) protect the hottest hours. However, heat strain depends on the person, the task and the weather on that day, and it continues outside those hours. Repeated days of heat strain and dehydration are linked to kidney injury, and nephrologists in Dhaka report returning migrant workers with kidney disease that they attribute to heat. Supervisors have no early, personal signal; workers often do not read English or Arabic.

## 2. Solution

HeatShield turns a low-cost heart-rate band and a phone into a personal heat-strain early-warning system:

1. **Estimate** core body temperature every minute from heart rate (no ingestible sensor).
2. **Add a calibrated safety margin** and alert on its upper bound, so a hot worker is not missed.
3. **Anticipate** heat strain: project the next hour under the site's WBGT forecast and report "danger in X minutes" and "rest needed".
4. **Warn** with ISO 7010-style signs and spoken alerts in six languages; supervisors see risk tiers only.
5. **Track** a weekly kidney heat-load index and prompt a simple clinic check (creatinine and urinalysis) after repeated hard days.

## 3. Architecture

```
 BLE heart-rate band ──► phone (web app, offline-capable)
                          ├─ ECTemp Kalman filter (1-min HR → core temperature)
                          ├─ conformal upper bound (calibration.json)
                          ├─ Open-Meteo forecast/archive → Liljegren WBGT (sun and shade)
                          ├─ forecast: keep working vs rest now, 60 min ahead
                          ├─ tiers, signs, voice (recorded clips → device TTS → vibration)
                          └─ weekly heat-load ledger (on-device storage)
                                 │ risk tier + countdown + rest status only
                                 ▼
                          supervisor view (crew list, rest rotation, site WBGT by hour)
```

All computation runs on the phone; the prototype is a static web app (HTML, CSS, JavaScript modules) with a service worker for offline use. The research package (Python) holds the reference implementation, the validation pipeline and tests. A parity test checks that the JavaScript models reproduce the Python outputs exactly.

## 4. Models

**Core temperature (Buller et al., 2013).** State CT_t = CT_{t−1} + w, w ~ N(0, 0.022²). Observation HR_t = −4.5714·CT_t² + 384.4286·CT_t − 7887.1 + v, v ~ N(0, 18.88²). Extended Kalman filter, 1-minute steps, start 37.1 °C.

**Safety margin (stratified split conformal).** On calibration subjects not used elsewhere, residuals r = measured − estimated are grouped into estimated-temperature bins (<37.5, 37.5–38, 38–38.5, ≥38.5 °C). The finite-sample (1−α) quantile of each bin gives the upper margin q, floored at the overall quantile so no band gets a smaller margin than average. Upper bound = estimate + q. α = 0.10.

**Heat stress (Liljegren et al., 2008).** Outdoor WBGT = 0.7·T_nwb + 0.2·T_g + 0.1·T_a, with natural wet-bulb and globe temperatures solved iteratively from air temperature, humidity, pressure, wind and solar radiation. The direct-beam fraction is taken from the forecast. Checked against the PyWBGT reference implementation: within 0.01 °C on its published test cases.

**Physiological Strain Index (Moran et al., 1998).** PSI = 5(Tc − 37.0)/(39.5 − 37.0) + 5(HR − HR_rest)/(180 − HR_rest).

**Alert tiers.** Threshold 38.5 °C for workers used to the heat and 38.0 °C for new arrivals (based on ACGIH heat-stress guidance; confirmed with our clinical lead **FILL**).
- Red: upper bound ≥ threshold, or PSI ≥ 7, or under 10 min to danger.
- Amber: under 30 min to danger, or upper bound within 0.5 °C of the threshold.
- Rest: until the upper bound is 0.3 °C below the threshold.

**Forecast (v0).** Heart rate is projected under two scenarios: keep working (current heart rate plus cardiovascular drift and the change in WBGT), and rest in shade (exponential recovery). The estimator then runs forward on the projected heart rate. Uncertainty grows with the square root of the horizon. Drift and time constant were fitted on the validation data (drift 0.0 bpm/min, heart-rate time constant 4 min; the laboratory protocol had constant work, so drift will be refitted on field data); the WBGT sensitivity will be fitted on field data.

**Kidney heat-load ledger (research index v0).** Daily degree-minutes above 38.0 °C, minutes with PSI ≥ 7, and urine colour (Armstrong 1–8). A day is red if degree-minutes ≥ 30, PSI-high minutes ≥ 30, or urine colour ≥ 6. A clinic check is prompted after ≥ 3 red days in 7, or dark urine on 2 consecutive days. Not clinically validated: it is the hypothesis our field study tests.

## 5. Data sources and rights

| Data | Use | Licence or rights |
| --- | --- | --- |
| Buono, heat-tolerance dataset (Mendeley Data, DOI 10.17632/g5sb382smp.1): heart rate and core temperature, 65 people, 2 h exercise in hot and neutral conditions | Validation and calibration | CC BY 4.0 |
| Priego-Quesada et al., Calera Research sensor validity dataset (Mendeley Data, DOI 10.17632/z9f499kv9d.1): 20 people, cycling ramp, BodyCap pill, Calera sensor, heart rate | Independent test | CC BY 4.0 |
| Open-Meteo forecast and historical weather APIs | Site WBGT | CC BY 4.0, free for non-commercial use |
| Synthetic weather day and synthetic test set (generated by us) | Offline fallback and pipeline tests only | Ours; never used for reported results |

No personal data is collected by the prototype. The demo worker and crew are simulated.

## 6. Validation results

**Main dataset:** Buono heat-tolerance data, 65 people, 2 h treadmill walking in heat (about 40 °C, 40% RH) and in neutral conditions (about 22 °C), core temperature mostly by telemetric pill, 1-minute heart rate. 130 sessions, 13,000 minutes analysed (first 5 minutes of each session excluded). Cleaning: 68 out-of-range and 62 single-minute spike core-temperature values removed (pill signal drops), 8 out-of-range heart rates removed.

| Measure (estimator starts at 37.1 °C, no thermometer) | Result |
| --- | --- |
| Bias, SD, RMSE (°C) | +0.03, 0.46, 0.46 |
| 95% limits of agreement (°C) | −0.87 to +0.92 |
| Heat sessions RMSE / neutral sessions RMSE (°C) | 0.47 / 0.45 |
| Upper-bound coverage on held-out people, 50 random splits (target 90%) | 93.2% (worst split 84.2%); mean margin +0.58 °C |
| Coverage when measured core temperature was ≥ 38.5 °C | 86.7% |
| Detecting core temperature ≥ 38.5 °C (1,045 positive minutes): estimate alone | sensitivity 65.7%, specificity 87.3% |
| Same, alerting on the upper bound (shipped, with safety floor) | **sensitivity 94.8%**, specificity 57.1% |
| Upper bound without the safety floor (alternative) | sensitivity 84.6%, specificity 71.6%; hottest-range coverage 72.3% |
| Detecting ≥ 38.0 °C on the upper bound | sensitivity 98.2%, specificity 24.9% |
| Forecast error at +15 / +30 min (MAE, °C) | 0.34 / 0.36; upper-bound coverage 97.6% / 98.1% |

Starting from one measured temperature at the start of the shift (for example an ear thermometer) lowers RMSE to 0.43 °C (tested without the safety floor: margin 0.42 °C, sensitivity 83.7%, specificity 76.2% at 38.5 °C).

**Independent test:** Priego-Quesada et al. cycling ramp to exhaustion (20 people, median 13.9 min, BodyCap pill, CC BY 4.0), using the Buono calibration unchanged. Heart-rate method: bias −0.32 °C, RMSE 0.44 °C, upper-bound coverage 88%. The commercial Calera heat-flux sensor in the same tests: bias −0.26 °C, RMSE 0.34 °C. So the heart-rate-only method came within 0.1 °C RMSE of a dedicated sensor without extra hardware. It underestimated in this short test because the filter starts at 37.1 °C and changes slowly.

**What this means:** alerting on the calibrated upper bound catches about 95 of every 100 dangerous minutes instead of 66. The price is false alarms (PPV 16%): many alerts come early, which is acceptable for a heat-stroke warning but must be tested for alarm fatigue in the pilot. The weak point is people who run hot while their heart rate stays moderate: coverage in the hottest range is 87%, still below the 90% target. This motivates the field study (Paper B) and personal recalibration.

Figures: `research/results/bland_altman.png`, `traces.png`, `error_by_bin.png`. Raw metrics: `research/results/metrics.json` (shipped), `metrics_no_floor.json`, `metrics_measured_start.json`, `external_calera.json`.

## 7. Assumptions

- One-minute mean heart rate from a chest strap or armband is available most of the shift.
- The Buller model's heart-rate to temperature relation is close enough in outdoor workers to be recalibrated, not rebuilt.
- Forecast WBGT at the site represents the worker's exposure (sun vs shade switch on rest).
- Workers follow rest prompts when supervisors support them.

## 8. Limitations

- The estimator was developed on soldiers and athletes; a published validation in elite athletes found low sensitivity above 39 °C. We counter this with the conformal upper bound but must validate in South Asian outdoor workers (field study below).
- Fever, beta-blockers and other heart-rate-altering medicines, dehydration, anxiety and caffeine can mislead the estimate.
- Validation data are laboratory exercise, not construction work in the sun.
- In the hottest range (measured ≥ 38.5 °C) the upper bound covered 87% of minutes, below the 90% target.
- Alerting on the upper bound raises false alarms (specificity 57%, PPV 16% at 38.5 °C); alarm fatigue must be measured in the pilot.
- The forecast is a v0 physiology-based projection with fitted drift; it is not yet validated in the field.
- The kidney heat-load index and its thresholds are research hypotheses, not diagnostic criteria.
- Translations other than Bengali need native-speaker review (I am Bangladeshi myself,I can only cover Bengali and English)
- Simulated workers in the demo use the same heart-rate relation as the estimator, so on-screen accuracy in demo mode is optimistic.

## 9.Safety and data governance

- **Safety first:** alerts use the upper bound; rules (not a language model) make every alert; symptoms override the app; "not a medical device" is shown in the app.
- **Privacy by design:** processing on the device; supervisors receive sign colour, countdown and rest status only; no location tracking of workers; data deletable by the worker.
- **Consent:** first-run consent screen in plain language; monitoring can stop any time.
- **No misuse:** the terms ban use of HeatShield data for discipline, hiring, pay or insurance decisions.
- **Transparency:** a model card in the app states the calibration source, coverage and limits.
- **Fairness:** thresholds differ for new arrivals; validation will report results by age group, body size and acclimatisation.
- **Regulatory path:** wellness and occupational-safety tool now,any diagnostic claim would need medical-device approval (DoH Abu Dhabi), which we will not make without clinical evidence.

## 10. Scalability and deployment

- Works with standard BLE heart-rate bands and Android phones; no proprietary hardware.
- Static web app: one copy serves any number of sites; per-site cost is weather data only (free tier).
- Offline-first: works with patchy connectivity on site.
- Next step: a crew sync service (supervisor view across phones) and integration with contractor HSE dashboards.

## 11.Pilot

- **I want to keep this service free as the workers are not solvent and won't be interested to use this service if paid subscription is applied,rather I want their safety**
- **Pilot:** one site,30 to 50 workers,8 weeks in summer 2027, with a contractor in Dhaka.Outcomes: alerts per worker, rest compliance, heat-illness first-aid events, worker acceptance, and pre/post-shift urine and creatinine in a consenting subset.(I can't afford Abu Dhabi site inspection)
- **Why us:** a Bangladeshi team with links to the communities most of these workers come from, and a clinical partner Professor Dr Shamimul Masud Ahmed,MMC
(mailto:shamimul.mahmed@gmail.com)

## 12. References

1. Buller MJ, Tharion WJ, Cheuvront SN, et al. Estimation of human core temperature from sequential heart rate observations. Physiol Meas. 2013;34:781–798.
2. Liljegren JC, Carhart RA, Lawday P, Tschopp S, Sharp R. Modeling the wet bulb globe temperature using standard meteorological measurements. J Occup Environ Hyg. 2008;5:645–655.
3. Moran DS, Shitzer A, Pandolf KB. A physiological strain index to evaluate heat stress. Am J Physiol. 1998;275:R129–R134.
4. Kong Q, Huber M. Explicit calculations of wet-bulb globe temperature compared with approximations and why it matters for labor productivity. Earth's Future. 2022. (PyWBGT)
5. Strickland J, et al. Degrees of uncertainty: conformal deep learning for non-invasive core body temperature prediction in extreme environments. Communications Engineering. 2025.
6. Vital Signs Partnership. Killer Heat: Gulf states' failure to protect migrant workers from extreme heat. 2023.
