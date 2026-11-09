import { VoiceSettings } from "./voice-settings.js";

const preference = "snap.readAloud";

export function speechText(content) {
  return String(content || "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n/gm, "")
    .replace(/^[ \t]*(`{3,}|~{3,})[ \t]*$/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/<\/?(?:p|br|div|span|strong|em|b|i|u|code|pre|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|sup|sub|details|summary)(?:\s[^<>]*)?\/?>/gi, "")
    .replace(/^[ \t]*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/(?:\*{1,3}|`+|\$\$?)/g, "")
    .replace(/\b_([^_\n]+)_\b/g, "$1")
    .replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({
      "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
    })[entity])
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Queue one short utterance at a time; long answers must not be truncated by
// mobile speech engines. Array.from also keeps surrogate pairs intact.
export function speechChunks(text, limit = 160) {
  const chunks = [];
  for (const paragraph of text.split(/\n+/)) {
    let characters = Array.from(paragraph.trim());
    while (characters.length > limit) {
      let end = limit;
      for (let index = limit - 1; index >= Math.floor(limit / 2); index--) {
        const character = characters[index];
        if (/[。！？!?，,；;\s]/.test(character) ||
            (character === "." && !/\d/.test(characters[index - 1]) && /\s/.test(characters[index + 1]))) {
          end = index + 1;
          break;
        }
      }
      const chunk = characters.slice(0, end).join("").trim();
      if (chunk) chunks.push(chunk);
      characters = characters.slice(end);
    }
    const chunk = characters.join("").trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

export class ReadAloud {
  constructor() {
    this.audio = window.__snapReadAloud;
    this.pending = new Set();
    this.run = 0;
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.id = "snap-read-aloud";
    this.button.setAttribute("aria-label", "自动朗读回答");
    this.button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg><span></span>';
    this.status = document.createElement("div");
    this.status.id = "snap-reading-status";
    this.status.hidden = true;
    this.status.innerHTML = '<span role="status"></span><button type="button">停止朗读</button>';
    this.status.lastElementChild.onclick = () => this.stop();
    this.voiceSettings = new VoiceSettings(this.audio, {
      preview: event => this.preview(event),
      changed: () => this.stop(),
      closed: () => { if (this.previewing) this.stop(); },
    });
    this.button.hidden = !this.audio?.mobile;
    if (!this.audio?.mobile) return;
    this.button.disabled = !this.audio.supported;
    this.enabled = this.audio.supported && this.saved();
    this.audio.enable(this.enabled);
    this.render();
    this.button.onclick = () => {
      this.setEnabled(!this.enabled);
      if (this.enabled) this.unlock();
    };
    window.addEventListener("snap:chat:start", event => {
      this.stop();
      this.pending.add(event.detail.id);
    });
    window.addEventListener("snap:chat:finish", event => {
      if (!this.pending.delete(event.detail.id) || !this.enabled || document.hidden) return;
      this.read(event.detail.content);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
    });
    window.addEventListener("pagehide", () => this.leave());
    window.addEventListener("popstate", () => this.leave());
    document.addEventListener("click", event => {
      if (event.target.closest?.('#new-chat-button,#sidebar-new-chat-button,a[href="/"],a[href^="/c/"],button[aria-label="停止"],button[aria-label="Stop"]')) this.leave();
    }, true);
    // A restored preference may still need a user gesture after a reload.
    // Unlock silently on the first natural interaction, never per answer.
    for (const name of ["pointerup", "touchend", "keydown"])
      document.addEventListener(name, event => {
        if (event.isTrusted && this.enabled && !this.unlocked) this.unlock();
      }, { passive: true });
    window.addEventListener("storage", event => {
      if (event.key === preference || event.key === null) this.setEnabled(this.saved(), false);
    });
  }

  saved() {
    try { return localStorage.getItem(preference) === "true"; }
    catch { return false; }
  }

  setEnabled(enabled, save = true) {
    this.enabled = this.audio.supported && Boolean(enabled);
    this.stop();
    this.audio.enable(this.enabled);
    if (save) {
      try { localStorage.setItem(preference, String(this.enabled)); }
      catch { /* The switch still works for this page in private mode. */ }
    }
    this.render();
  }

  unlock() {
    if (!this.enabled || this.unlocked) return;
    this.unlocked = true;
    const utterance = new SpeechSynthesisUtterance("。");
    utterance.volume = 0;
    // iOS requires the first speak() within a gesture. A silent utterance
    // starts that session without announcing a confirmation or old answer.
    utterance.onerror = () => { this.unlocked = false; };
    this.audio.speak(utterance);
  }

  leave() {
    this.pending.clear();
    this.stop();
  }

  stop() {
    this.run++;
    this.utterance = null;
    this.reading = false;
    this.previewing = false;
    this.audio?.cancel();
    this.voiceSettings.setPreviewing(false);
    this.status.hidden = true;
    this.render();
  }

  read(content) {
    this.stop();
    const answerText = speechText(content);
    const chunks = speechChunks(answerText);
    if (!chunks.length) return;
    const run = this.run;
    const next = () => {
      if (run !== this.run || !this.enabled || document.hidden) return;
      const text = chunks.shift();
      if (!text) { this.stop(); return; }
      this.reading = true;
      this.status.hidden = false;
      this.status.firstElementChild.textContent = "正在自动朗读回答";
      this.status.lastElementChild.hidden = false;
      this.render();
      const utterance = this.utterance = this.voiceSettings.configure(new SpeechSynthesisUtterance(text), answerText);
      utterance.onend = next;
      utterance.onerror = () => {
        if (run !== this.run) return;
        this.stop();
        this.status.hidden = false;
        this.status.firstElementChild.textContent = "暂时无法朗读，请检查系统语音或重新开启朗读";
        this.status.lastElementChild.hidden = true;
      };
      try { this.audio.speak(utterance); }
      catch { utterance.onerror(); }
    };
    next();
  }

  preview(event) {
    const wasPreviewing = this.previewing;
    this.stop();
    if (wasPreviewing) return;
    const text = "你好，我会用这个声音为你朗读回答。你可以先听一听，再选一个喜欢的声音。";
    const utterance = this.utterance = this.voiceSettings.configure(new SpeechSynthesisUtterance(text), text);
    const run = this.run;
    this.previewing = true;
    this.unlocked = true;
    this.voiceSettings.setPreviewing(true);
    utterance.onend = () => { if (run === this.run) this.stop(); };
    utterance.onerror = () => {
      if (run !== this.run) return;
      this.stop();
      this.unlocked = false;
      this.voiceSettings.setPreviewing(false, true);
    };
    try {
      if (!this.audio.preview(utterance, event)) utterance.onerror();
    } catch { utterance.onerror(); }
  }

  render() {
    this.button.setAttribute("aria-pressed", String(Boolean(this.enabled)));
    this.button.lastElementChild.textContent = this.reading ? "朗读中" : this.enabled ? "朗读开" : "朗读关";
    this.button.title = this.button.disabled ? "当前浏览器不支持语音朗读" :
      this.enabled ? "自动朗读已开启，点击关闭并停止朗读" : "自动朗读已关闭，点击开启";
  }
}
