const voicePreference = "snap.speechVoice";
const ratePreference = "snap.speechRate";
const language = voice => String(voice.lang || "").replaceAll("_", "-").toLowerCase();
const chinese = voice => /^(zh|cmn|yue)(-|$)/.test(language(voice));

export const voiceKey = voice => voice.voiceURI || voice.name + "|" + voice.lang;
const qualityHint = voice => voice.name + " " + (voice.voiceURI || "");
export const voiceLabel = voice => {
  if (!/premium|enhanced|natural|neural|高品质|高质量|优质|增强|自然|神经|高清/i.test(voice.name)) {
    if (/premium/i.test(voice.voiceURI || "")) return voice.name + " · 高品质";
    if (/enhanced|natural|neural/i.test(voice.voiceURI || "")) return voice.name + " · 增强";
  }
  return voice.name;
};

export function speechRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0.8 && rate <= 1.2 ? rate : 0.95;
}

// The API exposes no quality score. Name / URI markers are a heuristic,
// never a claim that a device has a particular voice or download installed.
export function chooseVoice(voices, preferred = "", lang = "zh-CN") {
  const selected = preferred && voices.find(voice => voiceKey(voice) === preferred);
  if (selected) return selected;
  const target = lang.toLowerCase();
  const score = voice => {
    const code = language(voice);
    const base = target.split("-")[0];
    let match = code === target ? 300 : code === base || code.startsWith(base + "-") ? 220 : 0;
    if (target === "zh-cn") {
      if (/^(zh-cn|cmn(?:-hans)?-cn|cmn-hans|zh-hans)(-|$)/.test(code)) match = 300;
      else if (/^(zh-sg|cmn|zh)$/.test(code)) match = 280;
      else if (/^(zh-hk|yue)(-|$)/.test(code)) match = 100;
    }
    if (!match) return -1;
    let quality = /premium|高品质|高质量|优质/i.test(qualityHint(voice)) ? 45 : 0;
    if (/enhanced|natural|neural|增强|自然|神经|高清/i.test(qualityHint(voice))) quality += 30;
    return match + quality + (voice.default ? 5 : 0);
  };
  return voices.reduce((best, voice) => score(voice) > (best ? score(best) : -1) ? voice : best, null);
}

export class VoiceSettings {
  constructor(audio, { preview, changed, closed }) {
    this.audio = audio;
    this.preferred = this.saved(voicePreference) || "";
    this.rate = speechRate(this.saved(ratePreference));
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.id = "snap-voice-settings";
    this.button.textContent = "声音";
    this.button.setAttribute("aria-label", "朗读声音与语速");
    this.button.setAttribute("aria-haspopup", "dialog");
    this.button.title = "选择朗读声音与语速";
    this.button.hidden = !audio?.mobile;
    this.button.disabled = !audio?.supported;
    this.onPreview = preview;
    this.onChange = changed;
    this.onClose = closed;
    this.button.onclick = () => this.open();
    if (audio?.mobile && audio.supported) {
      audio.onVoicesChanged?.(() => this.refresh());
      this.voices();
      window.addEventListener("focus", () => this.refresh());
      window.addEventListener("storage", event => {
        if (![voicePreference, ratePreference, null].includes(event.key)) return;
        this.preferred = this.saved(voicePreference) || "";
        this.rate = speechRate(this.saved(ratePreference));
        this.onChange();
        this.refresh();
      });
    }
  }

  saved(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
  }

  save(key, value) {
    try { localStorage.setItem(key, String(value)); }
    catch { /* Settings still apply for the current page in private mode. */ }
  }

  voices() {
    try { return this.audio?.voices() || []; }
    catch { return []; }
  }

  configure(utterance, text) {
    const lang = /[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en-US";
    const voice = chooseVoice(this.voices(), this.preferred, lang);
    utterance.lang = voice?.lang || lang;
    utterance.voice = voice;
    utterance.rate = this.rate;
    utterance.pitch = 1;
    return utterance;
  }

  open() {
    if (this.button.disabled || this.button.hidden) return;
    if (!this.dialog) this.create();
    this.refresh();
    this.dialog.showModal();
  }

  close() {
    // Native close events are asynchronous; cancel speech before closing.
    this.onClose();
    this.dialog.close();
    this.button.focus({ preventScroll: true });
  }

  create() {
    const dialog = this.dialog = document.createElement("dialog");
    dialog.id = "snap-voice-dialog";
    dialog.setAttribute("aria-labelledby", "snap-voice-title");
    dialog.innerHTML = `
      <header><div><span class="snap-voice-tag">按你的习惯来</span><h2 id="snap-voice-title">让声音听着更舒服</h2></div><button type="button" aria-label="关闭声音设置">×</button></header>
      <p class="snap-voice-intro">选个喜欢的声音，先听一听。</p>
      <label for="snap-voice-select">朗读声音</label>
      <select id="snap-voice-select"></select>
      <p id="snap-voice-description" class="snap-voice-description"></p>
      <div class="snap-rate-label"><label for="snap-speech-rate">朗读语速</label><output for="snap-speech-rate"></output></div>
      <input id="snap-speech-rate" type="range" min="0.8" max="1.2" step="0.05">
      <div class="snap-rate-hints"><span>慢一点</span><span>快一点</span></div>
      <button id="snap-voice-preview" type="button">试听声音</button>
      <p id="snap-voice-preview-status" role="status"></p>
      <p class="snap-voice-footnote">声音由手机系统提供，可在系统语音设置中下载更多中文音色。设置仅保存在当前浏览器。</p>`;
    this.select = dialog.querySelector("select");
    this.slider = dialog.querySelector("input");
    this.output = dialog.querySelector("output");
    this.description = dialog.querySelector("#snap-voice-description");
    this.previewButton = dialog.querySelector("#snap-voice-preview");
    this.previewStatus = dialog.querySelector("#snap-voice-preview-status");
    dialog.querySelector("header button").onclick = () => this.close();
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      this.close();
    });
    dialog.addEventListener("close", () => {
      this.onClose();
      if (!document.hidden && this.button.isConnected) this.button.focus({ preventScroll: true });
    });
    dialog.addEventListener("click", event => {
      if (event.target === dialog) {
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) this.close();
      }
    });
    this.select.onchange = () => {
      this.preferred = this.select.value;
      this.save(voicePreference, this.preferred);
      this.onChange();
      this.refresh();
    };
    this.slider.oninput = () => {
      this.rate = speechRate(this.slider.value);
      this.save(ratePreference, this.rate);
      this.onChange();
      this.output.textContent = this.rate.toFixed(2) + "×";
    };
    this.previewButton.onclick = event => this.onPreview(event);
    document.body.append(dialog);
  }

  refresh() {
    if (!this.dialog) return;
    const voices = [...new Map(this.voices().map(voice => [voiceKey(voice), voice])).values()];
    const selected = chooseVoice(voices, this.preferred);
    const automatic = chooseVoice(voices);
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "自动优选" + (automatic ? " · " + voiceLabel(automatic) : " · 系统默认");
    this.select.replaceChildren(option);
    for (const [label, matches] of [["中文声音", true], ["其他语言", false]]) {
      const items = voices.filter(voice => chinese(voice) === matches);
      if (!items.length) continue;
      const group = document.createElement("optgroup");
      group.label = label;
      for (const voice of items) {
        const option = document.createElement("option");
        option.value = voiceKey(voice);
        option.textContent = voiceLabel(voice) + " · " + voice.lang;
        group.append(option);
      }
      this.select.append(group);
    }
    this.select.value = voices.some(voice => voiceKey(voice) === this.preferred) ? this.preferred : "";
    this.description.textContent = this.preferred && this.select.value === "" ?
      "上次选择的声音暂不可用，当前使用自动优选。" :
      !voices.length ? "声音尚未载入，将使用系统默认声音。" :
      !voices.some(chinese) ? "当前未发现中文音色，可在手机系统中添加。" :
      this.preferred ? "当前声音：" + voiceLabel(selected) : "优先选择同语言中带高品质、增强或自然标识的声音。";
    this.slider.value = String(this.rate);
    this.output.textContent = this.rate.toFixed(2) + "×";
  }

  setPreviewing(value, error = false) {
    if (!this.dialog) return;
    this.previewButton.textContent = value ? "停止试听" : "试听声音";
    this.previewStatus.textContent = error ? "暂时无法试听，请检查手机的系统语音设置。" : value ? "正在试听，不会开启自动朗读" : "";
  }
}
