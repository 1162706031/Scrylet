const { performance } = require("node:perf_hooks");

const PHASES = Object.freeze([
  "app-start", "gateway-listening", "window-visible", "service-spawned",
  "legacy-http-healthy", "legacy-authenticated", "storage-ready",
  "legacy-scope-applied", "legacy-ui-applied", "legacy-workspace-initialized",
  "service-ready", "phone-interactive", "usable", "answer-visible", "answer-completed",
]);
const OBSERVATIONS = Object.freeze(["phone-interactive", "usable", "answer-visible", "answer-completed"]);

// A single clock in the Electron main process owns the entire timeline.
// No arbitrary labels, metadata, URLs or exception text enter this record.
class StartupMetrics {
  constructor({ enabled = false, now = () => performance.now(), startedAt = now() } = {}) {
    this.enabled = enabled;
    this.now = now;
    this.startedAt = startedAt;
    this.lastElapsed = 0;
    this.phases = [];
  }
  mark(phase) {
    if (!this.enabled || !PHASES.includes(phase) || this.phases.some(item => item.phase === phase)) return false;
    const elapsedMs = phase === "app-start" ? 0 : this.now() - this.startedAt;
    if (!Number.isFinite(elapsedMs) || elapsedMs < this.lastElapsed) return false;
    this.lastElapsed = elapsedMs;
    this.phases.push({ phase, elapsedMs: Math.round(elapsedMs * 1000) / 1000 });
    return true;
  }
  observe(phase) {
    if (!this.enabled || !OBSERVATIONS.includes(phase)) throw new Error("启动计时观察无效");
    const previous = phase === "phone-interactive" ? "service-ready" : OBSERVATIONS[OBSERVATIONS.indexOf(phase) - 1];
    if (!this.phases.some(item => item.phase === previous)) throw new Error("启动计时观察顺序无效");
    this.mark(phase);
    return this.snapshot();
  }
  snapshot() {
    return { schemaVersion: 1, enabled: this.enabled, unit: "ms", clock: "Electron main performance.now",
      phases: this.phases.map(item => ({ ...item })) };
  }
}

module.exports = { StartupMetrics, PHASES, OBSERVATIONS };
