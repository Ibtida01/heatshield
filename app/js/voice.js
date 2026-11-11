// Spoken alerts. Order: a recorded clip (audio/<lang>/<key>.mp3, listed in audio/manifest.json),
// then the device's text-to-speech voice for that language, then vibration only.
import { LANGS } from './i18n.js';

let clips = {};
fetch('./audio/manifest.json').then((r) => (r.ok ? r.json() : {})).then((m) => { clips = m || {}; }).catch(() => {});

function pickVoice(lang) {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  for (const tag of LANGS[lang].tags) {
    const v = voices.find((x) => x.lang.toLowerCase().replace('_', '-').startsWith(tag.toLowerCase()));
    if (v) return v;
  }
  return null;
}

export function voiceAvailable(lang) { return Boolean((clips[lang] && clips[lang].length) || pickVoice(lang)); }

export function speak(lang, key, text, { muted = false } = {}) {
  if (navigator.vibrate) navigator.vibrate(key === 'v_red' ? [400, 150, 400, 150, 400] : [250]);
  if (muted) return 'muted';
  if (clips[lang] && clips[lang].includes(key)) {
    new Audio(`./audio/${lang}/${key}.mp3`).play().catch(() => {});
    return 'clip';
  }
  const v = pickVoice(lang);
  if (v) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v; u.lang = v.lang; u.rate = 0.95;
    speechSynthesis.speak(u);
    return 'tts';
  }
  return 'none';
}

if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
