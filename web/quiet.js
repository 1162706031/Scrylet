/* Load before application modules. Notifications stay silent; only the phone's
 * explicit read-aloud control may use the captured speech implementation. */
(() => {
  if (window.__snapQuiet) return;
  window.__snapQuiet = true;

  HTMLMediaElement.prototype.play = function () {
    this.muted = true;
    return Promise.resolve();
  };
  for (const Source of [window.AudioScheduledSourceNode, window.AudioBufferSourceNode]) {
    if (Source) Source.prototype.start = function () {};
  }
  const synthesis = window.speechSynthesis;
  const speak = synthesis?.speak.bind(synthesis);
  const cancel = () => synthesis?.cancel();
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let enabled = false;
  cancel();
  window.__snapReadAloud = Object.freeze({
    mobile,
    supported: Boolean(synthesis && typeof window.SpeechSynthesisUtterance === "function"),
    enable(value) {
      enabled = mobile && Boolean(value);
      if (!enabled) cancel();
    },
    speak(utterance) {
      if (enabled && !document.hidden) speak?.(utterance);
    },
    preview(utterance, event) {
      if (!mobile || document.hidden || !(event instanceof Event) || !event.isTrusted || !speak) return false;
      speak(utterance);
      return true;
    },
    cancel,
    voices: () => synthesis?.getVoices() || [],
    onVoicesChanged(listener) {
      synthesis?.addEventListener?.("voiceschanged", listener);
      return () => synthesis?.removeEventListener?.("voiceschanged", listener);
    },
  });
  if (synthesis) {
    speechSynthesis.speak = function () {};
  }
  if (navigator.vibrate) navigator.vibrate = () => false;
  if (window.Notification) {
    window.Notification = class extends EventTarget {
      static get permission() { return "denied"; }
      static requestPermission(callback) {
        callback?.("denied");
        return Promise.resolve("denied");
      }
      close() {}
    };
  }
  if (window.ServiceWorkerRegistration) {
    ServiceWorkerRegistration.prototype.showNotification = () => Promise.resolve();
  }
})();
