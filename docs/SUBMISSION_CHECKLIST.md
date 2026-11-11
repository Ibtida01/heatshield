# 9-day plan and submission checklist (prototype due Fri 20 Nov 2026)

## Day by day

- [ ] **Wed 11 Nov:** unzip; run the tests; run the app locally; read all ten challenge statements on hack2skill and confirm "climate-resilient worker health"; assign roles.
- [ ] **Thu 12 Nov:** download the Buono dataset; run `validate_buono.py inspect` and `run`; check figures; commit the new `calibration.json`.
- [ ] **Fri 13 Nov:** push to GitHub and turn on GitHub Pages; open the link on an Android phone; install it to the home screen; test offline (airplane mode after one load).
- [ ] **Sat 14 Nov:** ask native speakers to check Hindi, Urdu, Nepali and Arabic; record Bengali clips (and Arabic if you can).
- [ ] **Sun 15 Nov:** meet your doctor contact: confirm thresholds (38.5/38.0 °C, PSI 7), the kidney-check rule and the referral wording; note their name and role for the documentation.
- [ ] **Mon 16 Nov:** optional: borrow or buy a standard BLE chest strap and test the Bluetooth mode; take your own site photos for the video (no faces without consent).
- [ ] **Tue 17 Nov:** fill every FILL in `TECHNICAL_DOCUMENTATION.md`; export it to PDF.
- [ ] **Wed 18 Nov:** record and edit the 3-minute video (`DEMO_SCRIPT.md`); upload it unlisted to YouTube or Drive.
- [ ] **Thu 19 Nov:** build the 10-slide deck (`PITCH_OUTLINE.md`); full dry run; fix bugs.
- [ ] **Fri 20 Nov:** submit early in the day (Abu Dhabi is 2 hours behind Dhaka; confirm the deadline time zone on the platform).

## What to submit (confirm against the platform's list after login)

- [ ] Working prototype link (GitHub Pages)
- [ ] Code repository link (public, or shared with judges if asked)
- [ ] Technical documentation PDF with assumptions and limitations
- [ ] Demo video link
- [ ] Pitch deck PDF
- [ ] Statement of what existed before the challenge and what was built during it
- [ ] Data sources and licences (Section 5 of the documentation)

## Quality checks before you submit

- [ ] The About screen no longer shows the "SYNTHETIC" warning (you ran the real validation)
- [ ] Every number in the video and deck matches `research/results/metrics.md`
- [ ] The app loads on a phone over mobile data, and again in airplane mode
- [ ] The consent screen appears on first visit
- [ ] No real worker names or faces without written consent
- [ ] `python -m pytest -q research/tests` and `node app/tests/parity.mjs` pass
