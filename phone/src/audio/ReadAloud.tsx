import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { speechText, speechChunks } from "../../../web/read-aloud.js";
import {
  chooseVoice,
  speechRate,
  voiceKey,
  voiceLabel,
} from "../../../web/voice-settings.js";
import { Icon } from "../Icon";
import { stored, remember } from "../api";
import type { Lifecycle } from "../chat/transport";
type QuietSpeech = {
  mobile: boolean;
  supported: boolean;
  enable(value: boolean): void;
  speak(value: SpeechSynthesisUtterance): void;
  preview(value: SpeechSynthesisUtterance, event: Event): boolean;
  cancel(): void;
  voices(): SpeechSynthesisVoice[];
  onVoicesChanged(listener: () => void): () => void;
};
declare global {
  interface Window {
    readonly __snapReadAloud?: QuietSpeech;
    readonly __snapQuiet?: boolean;
  }
}
type SpeechState = {
  enabled: boolean;
  reading: boolean;
  previewing: boolean;
  error: string;
  preferred: string;
  rate: number;
  voices: SpeechSynthesisVoice[];
};
export class PhoneSpeech {
  readonly audio = window.__snapReadAloud;
  private listeners = new Set<() => void>();
  private pending: string | null = null;
  private run = 0;
  private unlocked = false;
  private utterance: SpeechSynthesisUtterance | null = null;
  state: SpeechState = {
    enabled: Boolean(
      this.audio?.mobile &&
        this.audio.supported &&
        stored("snap.readAloud") === "true",
    ),
    reading: false,
    previewing: false,
    error: "",
    preferred: stored("snap.speechVoice") || "",
    rate: speechRate(stored("snap.speechRate")),
    voices: [],
  };
  readonly lifecycle: Lifecycle = {
    begin: (id) => {
      this.stop();
      this.pending = id;
    },
    finish: (id, content) => {
      if (this.pending !== id) return;
      this.pending = null;
      if (this.state.enabled && !document.hidden) this.read(content);
    },
    cancel: () => this.stop(),
  };
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = (): SpeechState => this.state;
  set(change: Partial<SpeechState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  mount(): () => void {
    if (!this.audio?.mobile) return () => {};
    this.audio.enable(this.state.enabled);
    const voices = (): void => {
      this.set({
        voices: [
          ...new Map(
            (this.audio?.voices() || []).map((v) => [voiceKey(v), v]),
          ).values(),
        ],
      });
    };
    const unsubscribe = this.audio.onVoicesChanged(voices);
    voices();
    const visibility = (): void => {
      if (document.hidden) this.stop();
    };
    const leave = (): void => this.stop();
    const unlock = (event: Event): void => {
      if (event.isTrusted && this.state.enabled) this.unlock();
    };
    const storage = (event: StorageEvent): void => {
      if (
        ![
          null,
          "snap.readAloud",
          "snap.speechVoice",
          "snap.speechRate",
        ].includes(event.key)
      )
        return;
      this.stop();
      this.set({
        enabled: Boolean(
          this.audio?.supported && stored("snap.readAloud") === "true",
        ),
        preferred: stored("snap.speechVoice") || "",
        rate: speechRate(stored("snap.speechRate")),
      });
      this.audio?.enable(this.state.enabled);
    };
    document.addEventListener("visibilitychange", visibility);
    addEventListener("pagehide", leave);
    addEventListener("storage", storage);
    addEventListener("focus", voices);
    for (const name of ["pointerup", "touchend", "keydown"])
      document.addEventListener(name, unlock, { passive: true });
    return () => {
      this.stop();
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      removeEventListener("pagehide", leave);
      removeEventListener("storage", storage);
      removeEventListener("focus", voices);
      for (const name of ["pointerup", "touchend", "keydown"])
        document.removeEventListener(name, unlock);
    };
  }
  toggle(): void {
    const enabled = Boolean(
      this.audio?.mobile && this.audio.supported && !this.state.enabled,
    );
    this.stop();
    this.set({ enabled });
    remember("snap.readAloud", String(enabled));
    this.audio?.enable(enabled);
    if (enabled) this.unlock();
  }
  private unlock(): void {
    if (this.unlocked || !this.state.enabled) return;
    this.unlocked = true;
    const utterance = new SpeechSynthesisUtterance("。");
    utterance.volume = 0;
    utterance.onerror = () => {
      this.unlocked = false;
    };
    this.audio?.speak(utterance);
  }
  stop(): void {
    this.run++;
    this.pending = null;
    this.utterance = null;
    this.audio?.cancel();
    this.set({ reading: false, previewing: false });
  }
  configure(
    utterance: SpeechSynthesisUtterance,
    text: string,
  ): SpeechSynthesisUtterance {
    const lang = /[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en-US",
      voice = chooseVoice(this.state.voices, this.state.preferred, lang);
    utterance.lang = voice?.lang || lang;
    utterance.voice = voice;
    utterance.rate = this.state.rate;
    utterance.pitch = 1;
    return utterance;
  }
  private read(content: string): void {
    this.stop();
    const answer = speechText(content),
      chunks = speechChunks(answer),
      run = this.run;
    const next = (): void => {
      if (run !== this.run || !this.state.enabled || document.hidden) return;
      const text = chunks.shift();
      if (!text) {
        this.stop();
        return;
      }
      this.set({ reading: true, error: "" });
      const utterance = (this.utterance = this.configure(
        new SpeechSynthesisUtterance(text),
        answer,
      ));
      utterance.onend = next;
      utterance.onerror = () => {
        if (run !== this.run) return;
        this.stop();
        this.set({ error: "暂时无法朗读，请检查系统语音或重新开启朗读" });
      };
      try {
        this.audio?.speak(utterance);
      } catch {
        this.stop();
        this.set({ error: "暂时无法朗读，请检查系统语音" });
      }
    };
    next();
  }
  preview(event: Event): void {
    const stop = this.state.previewing;
    this.stop();
    if (stop || !this.audio?.mobile || !this.audio.supported) return;
    const text =
        "你好，我会用这个声音为你朗读回答。你可以先听一听，再选一个喜欢的声音。",
      utterance = (this.utterance = this.configure(
        new SpeechSynthesisUtterance(text),
        text,
      )),
      run = this.run;
    this.set({ previewing: true, error: "" });
    utterance.onend = () => {
      if (run === this.run) this.stop();
    };
    utterance.onerror = () => {
      if (run !== this.run) return;
      this.stop();
      this.unlocked = false;
      this.set({ error: "暂时无法试听，请检查系统语音后重试" });
    };
    if (!this.audio.preview(utterance, event)) {
      this.stop();
      this.set({ error: "请点击试听按钮" });
    }
  }
  voice(value: string): void {
    this.stop();
    this.set({ preferred: value });
    remember("snap.speechVoice", value);
  }
  rate(value: string): void {
    this.stop();
    const rate = speechRate(value);
    this.set({ rate });
    remember("snap.speechRate", String(rate));
  }
}
export function usePhoneSpeech(): PhoneSpeech {
  const speech = useMemo(() => new PhoneSpeech(), []);
  useEffect(() => speech.mount(), [speech]);
  return speech;
}
export function SpeechControls({
  speech,
}: {
  speech: PhoneSpeech;
}): React.JSX.Element | null {
  const state = useSyncExternalStore(speech.subscribe, speech.snapshot),
    [open, setOpen] = useState(false);
  if (!speech.audio?.mobile) return null;
  const automatic = chooseVoice(state.voices),
    selected = chooseVoice(state.voices, state.preferred),
    missing = Boolean(
      state.preferred &&
        !state.voices.some((v) => voiceKey(v) === state.preferred),
    );
  const close = (): void => {
    if (state.previewing) speech.stop();
    setOpen(false);
  };
  return (
    <div className="speech-controls">
      <button
        id="snap-read-aloud"
        aria-label="自动朗读回答"
        aria-pressed={state.enabled}
        disabled={!speech.audio.supported}
        onClick={() => speech.toggle()}
      >
        <Icon name="volume" size={14} />
        {state.reading ? "朗读中" : state.enabled ? "朗读开" : "朗读关"}
      </button>
      <button
        id="snap-voice-settings"
        aria-label="朗读声音与语速"
        disabled={!speech.audio.supported}
        onClick={() => setOpen(true)}
      >
        <Icon name="settings" size={13} />声音
      </button>
      {state.reading && (
        <div id="snap-reading-status" role="status">
          正在自动朗读回答
          <button onClick={() => speech.stop()}>停止朗读</button>
        </div>
      )}
      {state.error && <small role="status">{state.error}</small>}
      {open && (
        <div className="modal-backdrop">
          <section
            className="dialog voice-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="声音设置"
          >
            <header>
              <div>
                <small>按你的习惯来</small>
                <h2>让声音听着更舒服</h2>
              </div>
              <button aria-label="关闭声音设置" onClick={close}>
                ×
              </button>
            </header>
            <p>选个喜欢的声音，先听一听。</p>
            <label htmlFor="snap-voice-select">朗读声音</label>
            <select
              id="snap-voice-select"
              value={state.preferred}
              onChange={(e) => speech.voice(e.target.value)}
            >
              <option value="">
                自动优选 · {automatic ? voiceLabel(automatic) : "系统默认"}
              </option>
              {missing && (
                <option value={state.preferred}>已选声音暂不可用</option>
              )}
              {state.voices.map((voice) => (
                <option key={voiceKey(voice)} value={voiceKey(voice)}>
                  {voiceLabel(voice)} · {voice.lang}
                </option>
              ))}
            </select>
            <p>
              {missing
                ? "原选择已保留，暂用 " +
                  (selected ? voiceLabel(selected) : "系统默认")
                : state.voices.length
                  ? "声音由手机系统提供"
                  : "系统声音列表尚未载入，稍后会自动更新"}
            </p>
            <label htmlFor="snap-speech-rate">
              朗读语速 <output>{state.rate.toFixed(2)}×</output>
            </label>
            <input
              id="snap-speech-rate"
              type="range"
              min="0.8"
              max="1.2"
              step="0.05"
              value={state.rate}
              onChange={(e) => speech.rate(e.target.value)}
            />
            <button
              id="snap-voice-preview"
              onClick={(e) => speech.preview(e.nativeEvent)}
            >
              {state.previewing ? "停止试听" : "试听声音"}
            </button>
            <p role="status">
              {state.error || (state.previewing ? "正在试听" : "")}
            </p>
            <small>
              可在系统语音设置中下载更多中文音色。设置仅保存在当前浏览器。
            </small>
          </section>
        </div>
      )}
    </div>
  );
}
