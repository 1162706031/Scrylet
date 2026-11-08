// Only the system speech engine is mocked; no physical speakers are exercised.
function mockSpeech() {
  window.phoneSpeechCalls = []; window.phoneSpeechCancelled = 0; window.phoneSpeechAutoEnd = true;
  window.phoneVoices = [{ name: "基础中文", lang: "zh-CN", voiceURI: "mock:basic", default: true }, { name: "中文增强", lang: "zh-CN", voiceURI: "mock:natural", default: false }];
  window.SpeechSynthesisUtterance = class extends EventTarget { constructor(text) { super(); this.text = text; this.volume = 1; } };
  const synthesis = Object.assign(new EventTarget(), {
    getVoices: () => window.phoneVoices, cancel: () => { window.phoneSpeechCancelled++; },
    speak: utterance => { window.phoneSpeechCalls.push({ text: utterance.text, volume: utterance.volume, rate: utterance.rate, lang: utterance.lang, voice: utterance.voice?.voiceURI });
      if (window.phoneSpeechError && utterance.volume !== 0) setTimeout(() => utterance.onerror?.({ error: "not-allowed" }), 0);
      else if (window.phoneSpeechAutoEnd || utterance.volume === 0) setTimeout(() => utterance.onend?.(), 5);
    },
  }); Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
}
module.exports = { mockSpeech };
