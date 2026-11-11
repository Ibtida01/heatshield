# Translation check and voice clips

Bengali was written natively. Hindi, Urdu, Nepali and Arabic need one native speaker each to read every line in `app/js/i18n.js` and fix wording. Ask friends, classmates or community groups; record who checked each language for the technical documentation.

## Lines to record (one MP3 per line per language)

Save as `app/audio/<lang>/<key>.mp3`, mono, 64–96 kbps, no music. Then list the keys in `app/audio/manifest.json`.

| Key | English | Bengali (record this) |
| --- | --- | --- |
| v_amber | Heat strain is rising. Slow down and drink water now. | শরীরে গরমের চাপ বাড়ছে। ধীরে কাজ করুন, এখনই পানি পান করুন। |
| v_red | Danger. Stop work and rest in the shade now. Drink water. | বিপদ। এখনই কাজ থামান, ছায়ায় বিশ্রাম নিন। পানি পান করুন। |
| v_cool | Your body has cooled down. You can go back to work slowly. | আপনার শরীর ঠান্ডা হয়েছে। ধীরে ধীরে কাজে ফিরতে পারেন। |
| v_kidney | You had several hard heat days this week. Please get a kidney check at the clinic. | এই সপ্তাহে কয়েকদিন আপনার শরীরে গরমের চাপ খুব বেশি ছিল। দয়া করে ক্লিনিকে কিডনি পরীক্ষা করান। |

The other languages' lines are in `app/js/i18n.js` under the same keys.

Recording on a phone: use a quiet room, hold the phone 20 cm away, speak calmly and clearly. Convert to MP3 with Audacity (free) if the phone records M4A.

Example `manifest.json` after recording Bengali and Arabic:

```json
{ "bn": ["v_amber", "v_red", "v_cool", "v_kidney"], "ar": ["v_amber", "v_red", "v_cool", "v_kidney"] }
```
