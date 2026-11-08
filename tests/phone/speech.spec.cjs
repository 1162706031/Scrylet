const { test, expect } = require("@playwright/test");
const { nodePhone } = require("./fixture.cjs");
const { open, send } = require("./helpers.cjs");
const { mockSpeech } = require("./mock-speech.cjs");
let fixture;
test.beforeAll(async () => { fixture = await nodePhone(); });
test.afterAll(async () => fixture?.stop());
test.beforeEach(async ({ page }) => { await fixture.resetDevices(); await page.addInitScript(mockSpeech); });
const spoken = page => page.evaluate(() => window.phoneSpeechCalls.filter(call => call.volume !== 0));
test("M2.4 default silence, completed own answer only, no historical/private-event replay", async ({ page }) => {
  await open(page, fixture); await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "false"); await send(page, fixture, "默认静默"); expect(await spoken(page)).toEqual([]);
  await page.locator("#snap-read-aloud").click(); await send(page, fixture, "请朗读新完成回答"); await expect.poll(async () => (await spoken(page)).map(call => call.text).join("")).toContain("c = 5");
  await expect(page.locator("#snap-reading-status")).toBeHidden(); expect((await spoken(page)).every(call => call.rate === 0.95)).toBe(true); const count = (await spoken(page)).length;
  await page.evaluate(() => { new EventTarget().dispatchEvent(new CustomEvent("chat:finish", { detail: { id: "forged", content: "不要朗读" } })); window.dispatchEvent(new CustomEvent("snap:chat:finish", { detail: { id: "forged", content: "不要朗读" } })); speechSynthesis.speak(new SpeechSynthesisUtterance("旧播放调用")); }); expect((await spoken(page)).length).toBe(count);
  await page.reload(); await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "true"); await expect(page.locator(".message.assistant")).toHaveCount(2); expect(await spoken(page)).toEqual([]);
});
test("M2.4 desktop-triggered answer reads; stop, hidden/navigation/new generation cancel without stopping model", async ({ page }) => {
  await open(page, fixture); await page.locator("#snap-read-aloud").click(); await page.evaluate(() => { window.phoneSpeechAutoEnd = false; });
  await expect.poll(async () => (await fixture.receivers()).some(r => r.ready)).toBe(true); expect(await fixture.command()).toBe(true); await expect(page.getByRole("button", { name: "停止朗读", exact: true })).toBeVisible();
  const cancelled = await page.evaluate(() => window.phoneSpeechCancelled); await page.getByRole("button", { name: "停止朗读", exact: true }).click(); expect(await page.evaluate(() => window.phoneSpeechCancelled)).toBeGreaterThan(cancelled); await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "true");
  await send(page, fixture, "开始下一次朗读"); await expect(page.locator("#snap-reading-status")).toBeVisible(); await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); }); await expect(page.locator("#snap-reading-status")).toBeHidden();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await send(page, fixture, "切换对话取消朗读"); await page.getByRole("button", { name: "新对话", exact: true }).click(); await expect(page.locator("#snap-reading-status")).toBeHidden();
  const before = (await spoken(page)).length; await page.getByLabel("当前模型").selectOption("openai.cancel"); await page.locator("#chat-input").fill("停止时不播部分回答"); await page.locator("#send-message-button").click(); await expect(page.getByRole("button", { name: "停止生成" })).toBeVisible(); await page.getByRole("button", { name: "停止生成" }).click(); await expect(page.getByText("已停止", { exact: true })).toBeVisible(); expect((await spoken(page)).length).toBe(before);
});
test("M2.4 voice preview is trusted opt-in, rate/voice persist and unavailable selection survives fallback", async ({ page }, info) => {
  await open(page, fixture); await page.getByRole("button", { name: "朗读声音与语速" }).click(); await page.locator("#snap-voice-select").selectOption("mock:basic");
  await page.locator("#snap-speech-rate").focus(); for (let i = 0; i < 3; i++) await page.locator("#snap-speech-rate").press("ArrowRight"); await page.getByRole("button", { name: "试听声音", exact: true }).click(); await expect.poll(async () => (await spoken(page)).length).toBe(1); expect((await spoken(page))[0]).toMatchObject({ rate: 1.1, voice: "mock:basic" }); await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => { window.phoneVoices = [{ name: "增强中文", lang: "zh-CN", voiceURI: "mock:natural" }]; speechSynthesis.dispatchEvent(new Event("voiceschanged")); }); await expect(page.locator("#snap-voice-select")).toHaveValue("mock:basic"); await expect(page.getByText(/原选择已保留/)).toBeVisible();
  await page.evaluate(() => { window.phoneSpeechAutoEnd = false; }); await page.getByRole("button", { name: "试听声音", exact: true }).click(); await expect(page.getByRole("button", { name: "停止试听" })).toBeVisible(); const cancelled = await page.evaluate(() => window.phoneSpeechCancelled); await page.getByRole("button", { name: "关闭声音设置" }).click(); expect(await page.evaluate(() => window.phoneSpeechCancelled)).toBeGreaterThan(cancelled);
  await page.reload(); await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "false"); await page.getByRole("button", { name: "朗读声音与语速" }).click(); await expect(page.locator("#snap-speech-rate")).toHaveValue("1.1"); await expect(page.locator("#snap-voice-select")).toHaveValue("mock:basic"); await page.screenshot({ path: info.outputPath("voice-settings.png"), fullPage: true });
});
test("M2.4 raw notification audio URLs decode to all-zero PCM and quiet wrappers suppress media/notification/vibration", async ({ page }) => {
  await open(page, fixture);
  const samples = await page.evaluate(async () => {
    const result = [];
    for (const url of ["/audio/notification.mp3", "/audio/greeting.mp3"]) {
      const bytes = await (await fetch(url)).arrayBuffer();
      if (typeof OfflineAudioContext === "function") {
        const context = new OfflineAudioContext(1, 1, 24000), audio = await context.decodeAudioData(bytes);
        let max = 0; for (let channel = 0; channel < audio.numberOfChannels; channel++) for (const value of audio.getChannelData(channel)) max = Math.max(max, Math.abs(value)); result.push({ url, max, frames: audio.length, decoder: "WebAudio" });
      } else {
        // Windows WebKit has no WebAudio. Validate the actual served PCM WAV,
        // without labelling this fallback as browser playback or speaker testing.
        const view = new DataView(bytes), tag = offset => String.fromCharCode(...new Uint8Array(bytes, offset, 4));
        if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " || view.getUint16(20, true) !== 1 || view.getUint16(34, true) !== 16 || tag(36) !== "data" || view.getUint32(40, true) !== bytes.byteLength - 44) throw Error("PCM_FORMAT");
        let max = 0; for (let offset = 44; offset < bytes.byteLength; offset += 2) max = Math.max(max, Math.abs(view.getInt16(offset, true)) / 32768); result.push({ url, max, frames: (bytes.byteLength - 44) / 2, decoder: "PCM-WAV" });
      }
    }
    const media = new Audio(); await media.play(); return { result, muted: media.muted, permission: typeof Notification === "function" ? await Notification.requestPermission() : "unavailable", vibrate: navigator.vibrate?.(50) || false };
  }); expect(samples.result.every(sample => sample.max === 0 && sample.frames > 0)).toBe(true); expect(samples).toMatchObject({ muted: true, vibrate: false }); expect(["denied", "unavailable"]).toContain(samples.permission);
});
test.describe("desktop browser boundary", () => {
  test.use({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36", isMobile: false, hasTouch: false });
  test("M2.4 desktop has no read-aloud/preview and captured bridge refuses synthetic events", async ({ page }) => {
    await open(page, fixture); await expect(page.locator("#snap-read-aloud")).toHaveCount(0); await expect(page.locator("#snap-voice-settings")).toHaveCount(0);
    const allowed = await page.evaluate(() => { window.__snapReadAloud.enable(true); window.__snapReadAloud.speak(new SpeechSynthesisUtterance("blocked")); return window.__snapReadAloud.preview(new SpeechSynthesisUtterance("blocked"), new Event("click")); }); expect(allowed).toBe(false); expect(await spoken(page)).toEqual([]);
  });
});
