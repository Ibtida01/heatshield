# 3-minute demo video script

Record in OBS at 1080p: full-screen Chrome on the left (laptop, desktop layout), a phone in the corner if you have one. Speak slowly; captions in English. Rehearse three times with a timer.

| Time | Screen | Say (roughly) |
| --- | --- | --- |
| 0:00–0:15 | A construction-site photo you took (your own photo, no faces needed) | "Every summer, millions of South Asian workers build the Gulf in heat close to 50 °C. Many go home with kidney damage. Fixed rest hours help, but heat strain is personal." |
| 0:15–0:30 | App opens at 07:00, green sign | "HeatShield turns a 30-dollar heart-rate band and a phone into a personal early warning. It estimates body heat every minute and warns *before* danger." Name the price only if you checked it locally. |
| 0:30–0:55 | Demo controls: Abu Dhabi, replay 15 Jul 2025, heavy work, 60× | "This is real weather for Abu Dhabi on 15 July 2025. The phone turns it into WBGT heat stress with the standard Liljegren model." Point at the hourly WBGT bars. |
| 0:55–1:20 | Amber triangle, "Danger in 18 min", chart with two dashed lines | "Here is the difference: HeatShield projects the next hour two ways, keep working or rest now, and counts down to danger. That is 18 minutes of warning, not an alarm when it is too late." |
| 1:20–1:40 | Switch language to Bengali; red sign, voice plays | "Workers hear it in their language: Bengali, Hindi, Urdu, Nepali or Arabic." Let the Bengali alert play. Tap Start rest. |
| 1:40–2:00 | Crew tab | "The supervisor sees who should rest now and next, never heart rate or body temperature. Bikash arrived three days ago, so his threshold is lower." |
| 2:00–2:20 | Week tab, kidney box | "Repeated hard days are counted. After three in a week, HeatShield prompts a simple kidney test and creates a referral note." |
| 2:20–2:45 | About tab, model card; then your Bland–Altman figure | "We validated on an open dataset of 65 people walking two hours in 40-degree heat: average error under half a degree. Alerting on our calibrated safety margin raised detection of dangerous body temperature from 66 to 95 percent. On a second, independent dataset we came within 0.1 degrees of a commercial sensor, with no extra hardware. Everything runs on the phone." |
| 2:45–3:00 | Team photo or logo | "Next: an 8-week pilot with a contractor in Abu Dhabi and a field study in Dhaka. HeatShield: rest before it's too late." |

Demo links to open in tabs before recording:

- `.../app/?start=10&level=heavy&jump=40#kiosk` (amber phase coming)
- `.../app/?lang=bn&start=10&level=heavy&jump=70#kiosk` (red in Bengali)
- `.../app/?tab=week&start=10&level=heavy&jump=120#kiosk`

Tips: clear the browser's site data before recording so the consent screen appears once for the opening shot; turn on "Spoken alerts" in Demo controls; record voice clips (see TRANSLATION_CHECK.md) so the alert sounds natural.
