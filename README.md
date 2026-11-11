# HeatShield

HeatShield warns outdoor workers **before** dangerous heat strain, in their own language, and tracks the weekly heat load that is linked to kidney injury. Built for the Future Health Digital Innovation Challenge 2026 (climate-resilient worker health).

- **Worker phone:** a safety sign, "danger in X min", spoken alerts in English, Bengali, Hindi, Urdu, Nepali and Arabic.
- **Supervisor:** crew list sorted by risk, rest rotation, site WBGT by hour, UAE midday-break awareness. No raw vitals.
- **Week:** a kidney heat-load ledger that prompts a clinic check after repeated hard days.
- **Everything runs in the browser.** Free static hosting, works offline, no server, no Azure needed.

```
heatshield/
├── app/                 the web app (static; open index.html through any web server)
│   ├── js/models.js     estimator, WBGT, PSI, conformal, forecast, ledger (port of the Python)
│   ├── model/calibration.json   safety-margin calibration (regenerate from real data!)
│   └── tests/parity.mjs checks JS == Python
├── research/            Python package, validation and tests
│   ├── heatshield/      the models
│   ├── scripts/validate_buono.py   validates on real data, writes app calibration
│   └── tests/
└── docs/                submission documents, demo script, pitch, checklists
```

## 1. Install (once, about 15 minutes)

Download and install:

| What | Why | Where |
| --- | --- | --- |
| Python 3.10+ | validation and figures | python.org |
| Node.js 20+ | the JS/Python parity test | nodejs.org |
| Git + a GitHub account | free hosting with GitHub Pages | git-scm.com, github.com |
| VS Code | editing | code.visualstudio.com |
| Google Chrome | demo browser (voices, Bluetooth) | google.com/chrome |
| OBS Studio | recording the 3-minute demo video | obsproject.com |

Then, in a terminal inside `heatshield/`:

```bash
python -m pip install -r research/requirements.txt
python -m pytest -q research/tests          # 10 tests should pass
python research/tests/make_fixtures.py && node app/tests/parity.mjs
```

## 2. Run the app on your laptop

```bash
cd app
python -m http.server 8000
```

Open http://localhost:8000. Open **Demo controls** to choose the site, a real summer day to replay, speed and workload.

Useful demo links (add `#kiosk` to skip the consent screen on a booth laptop):

- `http://localhost:8000/?start=10&level=heavy&jump=50` jumps to mid-morning of heavy work
- `?lang=bn&start=10&level=heavy&jump=75` shows the red state in Bengali
- `?lang=ar&accl=no&start=9&jump=50` shows a new arrival, in Arabic (right to left)
- `?tab=week` opens the weekly kidney heat-load screen

## 3. Validation data (done once; results are already in research/results)

The calibration file shipped in `app/model/` is from **synthetic** test data. The app says so on screen. Replace it with real numbers before you submit:

0. With the two Excel files you downloaded, the quickest route is:
   ```bash
   python research/scripts/convert_datasets.py --htt "D:/projects/MS_future_health_challenge/heatshield/research/data/buono/HTT data set.xlsx" --calera "D:/projects/MS_future_health_challenge/heatshield/research/data/Jose Ignacio Priego-Quesada/dataset.xlsx" --out research/data
   python research/scripts/validate_buono.py run research/data/htt_long.csv --subject-col subject --time-col minute --hr-col hr --tc-col tc --condition-col condition --name "Buono heat-tolerance dataset (Mendeley, CC BY 4.0)"
   python research/scripts/external_calera.py --data research/data/calera_long.csv
   ```
1. Download the dataset **"Predicting heat tolerance status from exercise in thermoneutral conditions"** (Buono, San Diego State University; CC BY 4.0) from Mendeley Data: https://data.mendeley.com/datasets/g5sb382smp. Save it in `research/data/buono/`.
2. Look at the file:
   ```bash
   python research/scripts/validate_buono.py inspect research/data/buono/<file>
   ```
3. Run validation with the column names you saw (example):
   ```bash
   python research/scripts/validate_buono.py run research/data/buono/<file> \
     --subject-col Subject --time-col Time --hr-col HR --tc-col Tcore \
     --condition-col Condition --time-unit minutes --name "Buono heat-tolerance dataset (Mendeley, CC BY 4.0)"
   ```
   If every Excel sheet is one person, add `--sheet-per-subject`. If time is in seconds, use `--time-unit seconds`.
4. Results land in `research/results/` (`metrics.md` plus four figures), and `app/model/calibration.json` is rewritten. Paste `metrics.md` into the technical documentation, and put `bland_altman.png` and `traces.png` in your pitch.

If the file layout does not fit the loader, send the `inspect` output to whoever maintains the script; the loader only needs subject, time, heart rate and core temperature columns.

Optional second dataset: "Effect of aerobic fitness on the validity of the Calera Research sensor" (Mendeley, DOI 10.17632/z9f499kv9d.1). Check its licence first.

## 4. Put it online for the judges (free, about 20 minutes)

1. Create a public GitHub repository, for example `heatshield`.
2. Push this folder:
   ```bash
   git init && git add . && git commit -m "HeatShield prototype"
   git branch -M main
   git remote add origin https://github.com/<you>/heatshield.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → main / root**. Save.
4. Your link is `https://<you>.github.io/heatshield/app/`. HTTPS is required for Bluetooth and the offline mode; GitHub Pages provides it.

Netlify, Vercel or Cloudflare Pages also work: drag the `app` folder into their dashboard.

## 5. Voices

The app first plays recorded clips, then the phone's text-to-speech, then vibrates. Android phones with Google text-to-speech usually have Bengali, Hindi, Urdu, Nepali and Arabic; laptops often do not. For a reliable demo, record your own clips (see `docs/TRANSLATION_CHECK.md`), save them as `app/audio/<lang>/<key>.mp3` and list them in `app/audio/manifest.json`, for example:

```json
{ "bn": ["v_amber", "v_red", "v_cool", "v_kidney"] }
```

## 6. Optional: a real heart-rate band

Any standard Bluetooth heart-rate chest strap (Polar H9/H10, Coospo H6/H808S, Garmin HRM-Dual, Magene H64) works in Chrome on Android, Windows or macOS. In Demo controls choose **Bluetooth band**. Readings update once a minute. iPhone Safari cannot use Bluetooth from a web page; use the simulator there.

## What is real and what is simulated

| Part | Status |
| --- | --- |
| Core-temperature estimator, WBGT, PSI, conformal margin, forecast, ledger | Real code; WBGT checked against PyWBGT within 0.01 °C; JS matches Python exactly |
| Weather | Real Open-Meteo data (forecast or a past day); synthetic fallback only when offline, and labelled |
| Worker heart rate in the demo | Simulated, unless a band is connected |
| Crew of eight | Simulated workers to show the supervisor view |
| Earlier days in the Week screen | Example history, labelled |
| Accuracy numbers | Only from `research/results/` after running on real data |
