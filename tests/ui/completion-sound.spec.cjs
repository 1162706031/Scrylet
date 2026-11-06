const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFixture } = require("../fixture.cjs");

// Windows Playwright WebKit has no Web Audio decoder. Validate its real PCM
// response directly; Chromium additionally decodes with the browser codec.
async function measureCue(cue) {
  const response = await fetch("/audio/" + cue);
  const bytes = await response.arrayBuffer();
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  let peak = 0, duration, measurement;
  if (AudioEngine) {
    const audio = new AudioEngine();
    try {
      const decoded = await audio.decodeAudioData(bytes);
      for (let index = 0; index < decoded.numberOfChannels; index++)
        for (const sample of decoded.getChannelData(index)) peak = Math.max(peak, Math.abs(sample));
      duration = decoded.duration;
      measurement = "browser-decoded";
    } finally { await audio.close(); }
  } else {
    const view = new DataView(bytes);
    const magic = String.fromCharCode(...new Uint8Array(bytes, 0, 4));
    if (magic !== "RIFF" || view.getUint16(20, true) !== 1 || view.getUint16(34, true) !== 16)
      throw new Error("Expected uncompressed 16-bit PCM audio");
    const length = view.getUint32(40, true);
    if (length !== bytes.byteLength - 44) throw new Error("Invalid PCM payload length");
    for (let offset = 44; offset < bytes.byteLength; offset += 2)
      peak = Math.max(peak, Math.abs(view.getInt16(offset, true)) / 32768);
    duration = length / view.getUint32(28, true);
    measurement = "pcm-payload";
  }
  return { cue, status: response.status, type: response.headers.get("content-type"), duration, peak, measurement };
}

let fixture, directory;
test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-completion-audio-"));
  fixture = await createFixture(directory);
});
test.afterAll(async () => {
  await fixture?.stop();
  if (directory) await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test("回答完成提示文件本身没有可听信号，旧页面也不能播放原提示音", async ({ page }, testInfo) => {
  // Reproduce an already-open tab that never loaded the new browser guard.
  // Decode the actual server response; no playback API is mocked or invoked.
  await page.route("**/snap/assets/quiet.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#snap-capture")).toBeEnabled({ timeout: 60000 });
  const measurements = [];
  for (const cue of ["notification.mp3", "greeting.mp3"])
    measurements.push(await page.evaluate(measureCue, cue));
  fs.writeFileSync(path.join("test-results", "completion-audio-" + testInfo.project.name + ".json"), JSON.stringify(measurements, null, 2) + "\n");
  for (const measurement of measurements) {
    expect(measurement.status).toBe(200);
    expect(measurement.duration).toBeGreaterThan(0);
    expect(measurement.peak, measurement.cue + " must contain only digital silence").toBe(0);
  }
});

test("真实后台会话完成事件触发旧版播放器时，返回的音频仍完全静音", async ({ page, context }, testInfo) => {
  const preferences = await fixture.runtime.request("/api/v1/users/user/settings");
  await fixture.runtime.request("/api/v1/users/user/settings/update", {
    method: "POST", body: { ...preferences, ui: { ...preferences.ui,
      notificationSound: true, notificationSoundAlways: true, notificationEnabled: false } },
  });
  await context.route("**/snap/assets/quiet.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await context.addInitScript(() => {
    window.__cuePlays = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      // Preserve the real player and its network request. Mute this test page
      // as a precaution; the actual decoded sample values are checked below.
      this.muted = true;
      const attempt = { src: this.currentSrc || this.src, started: false, ended: false };
      window.__cuePlays.push(attempt);
      this.addEventListener("ended", () => { attempt.ended = true; }, { once: true });
      return play.apply(this, args).then(() => { attempt.started = true; }, error => {
        attempt.error = error.name;
      });
    };
  });
  let observer;
  const completions = [];
  try {
    await page.goto(fixture.pairingUrl);
    await expect(page.locator("#snap-capture")).toBeEnabled({ timeout: 60000 });
    observer = await context.newPage();
    observer.on("websocket", socket => socket.on("framereceived", frame => {
      if (typeof frame.payload !== "string" || !frame.payload.startsWith("42")) return;
      try {
        const [name, envelope] = JSON.parse(frame.payload.slice(2));
        const event = envelope?.data;
        if (name === "events" && event?.type === "chat:completion" && event.data?.done)
          completions.push({ done: true });
      } catch { /* Ignore transport control frames. */ }
    }));
    await observer.goto(fixture.url);
    await expect(observer.locator("#snap-capture")).toBeEnabled();
    await observer.bringToFront();
    await observer.mouse.click(5, 300);
    await page.bringToFront();
    const before = fixture.requests.length;
    await page.locator("#chat-input").fill("验证回答结束时的后台提示音");
    await page.locator("#send-message-button").click();
    await expect.poll(() => fixture.requests.length).toBe(before + 1);
    await expect.poll(() => completions.length, { timeout: 30000 }).toBeGreaterThan(0);
    await expect.poll(() => observer.evaluate(() => window.__cuePlays.filter(attempt => attempt.src.includes("/audio/notification.mp3")).length)).toBeGreaterThan(0);
    await expect.poll(() => observer.evaluate(() => window.__cuePlays.some(attempt => attempt.src.includes("/audio/notification.mp3") && (attempt.ended || attempt.error)))).toBe(true);
    const playback = await observer.evaluate(() => ({
      webAudioAvailable: Boolean(window.AudioContext || window.webkitAudioContext),
      ended: window.__cuePlays.filter(attempt => attempt.src.includes("/audio/notification.mp3") && attempt.ended).length,
      errors: window.__cuePlays.filter(attempt => attempt.src.includes("/audio/notification.mp3") && attempt.error).map(attempt => attempt.error),
    }));
    if (playback.webAudioAvailable) {
      expect(playback.ended).toBeGreaterThan(0);
      expect(playback.errors).toEqual([]);
    } else {
      // The Windows WebKit port may lack media playback as well as decoding.
      for (const error of playback.errors) expect(error).toBe("NotSupportedError");
    }
    const result = { ...(await observer.evaluate(measureCue, "notification.mp3")), playback };
    expect(result.peak).toBe(0);
    fs.writeFileSync(path.join("test-results", "background-completion-audio-" + testInfo.project.name + ".json"), JSON.stringify({ ...result, websocketCompletionReceived: true }, null, 2) + "\n");
  } finally {
    await observer?.close();
    await fixture.runtime.applyUiPolicy();
  }
});
