const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFixture } = require("../fixture.cjs");

const phoneAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
test.use({ userAgent: phoneAgent });

// Mock only the device speech engine. Chat, streamed model response and the
// upstream private EventTarget lifecycle all run unmodified. No speaker sound.
function mockSpeech() {
  window.__speechCalls = [];
  window.__speechCancelled = 0;
  window.__speechAutoEnd = true;
  window.__speechEvents = [];
  window.__speechVoices = [
    { name: "Mock Chinese", lang: "zh-CN", voiceURI: "mock:zh-basic", default: true, localService: true },
    { name: "中文声线（增强）", lang: "zh-CN", voiceURI: "mock:zh-enhanced", localService: true },
    { name: "English Natural", lang: "en-US", voiceURI: "mock:en-natural", localService: true },
  ];
  for (const name of ["snap:chat:start", "snap:chat:finish"])
    window.addEventListener(name, event => window.__speechEvents.push({ type: name, id: event.detail.id }));
  window.SpeechSynthesisUtterance = class extends EventTarget {
    constructor(text) { super(); this.text = text; this.volume = 1; }
  };
  const synthesis = Object.assign(new EventTarget(), {
    getVoices: () => window.__speechVoices,
    cancel: () => { window.__speechCancelled++; },
    speak: utterance => {
      window.__speechCalls.push({ text: utterance.text, volume: utterance.volume, lang: utterance.lang,
        rate: utterance.rate, pitch: utterance.pitch, voice: utterance.voice?.voiceURI,
        completed: window.__speechEvents.at(-1)?.type === "snap:chat:finish" });
      if (window.__speechError && utterance.volume !== 0)
        setTimeout(() => utterance.onerror?.({ error: "not-allowed" }), 0);
      else if (window.__speechAutoEnd || utterance.volume === 0)
        setTimeout(() => utterance.onend?.(), 5);
    },
  });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
}

let fixture, directory;
test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-read-aloud-"));
  fixture = await createFixture(directory);
});
test.afterAll(async () => {
  await fixture?.stop();
  if (directory) await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
test.beforeEach(async ({ page }) => {
  for (const device of fixture.gateway.pairing.list()) fixture.gateway.revoke(device.id);
  await page.addInitScript(mockSpeech);
});

async function open(page) {
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#snap-capture")).toBeEnabled({ timeout: 60000 });
}
async function send(page, text) {
  const before = fixture.requests.length;
  const finishes = await page.evaluate(() => window.__speechEvents.filter(event => event.type === "snap:chat:finish").length);
  await page.locator("#chat-input").fill(text);
  await page.locator("#send-message-button").click();
  await expect.poll(() => fixture.requests.length).toBe(before + 1);
  await expect.poll(() => page.evaluate(() => window.__speechEvents.filter(event => event.type === "snap:chat:finish").length)).toBe(finishes + 1);
}
async function spoken(page) {
  return page.evaluate(() => window.__speechCalls.filter(call => call.volume !== 0));
}

test("手机默认关闭，回答完成和旧版自动播放调用均保持静默", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("button", { name: "自动朗读回答", exact: true })).toHaveAttribute("aria-pressed", "false");
  await send(page, "验证默认静默");
  await page.evaluate(() => speechSynthesis.speak(new SpeechSynthesisUtterance("旧版自动播放")));
  expect(await spoken(page)).toEqual([]);
  await expect(page.locator("#snap-reading-status")).toBeHidden();
});

test("开启后每轮流式回答只在完成时自动朗读，重复完成事件不重播", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page);
  await page.locator("#snap-read-aloud").click();
  await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "true");
  expect(await spoken(page)).toEqual([]);
  await send(page, "请自动朗读这次回答");
  await expect.poll(async () => (await spoken(page)).map(call => call.text).join("")).toContain("5");
  await expect(page.locator("#snap-reading-status")).toBeHidden();
  expect((await spoken(page)).every(call => call.completed)).toBe(true);
  const first = (await spoken(page)).length;
  await page.evaluate(() => {
    const event = window.__speechEvents.filter(event => event.type === "snap:chat:finish").at(-1);
    new EventTarget().dispatchEvent(new CustomEvent("chat:finish", { detail: { id: event.id, content: "重复事件不得朗读" } }));
    speechSynthesis.speak(new SpeechSynthesisUtterance("开启后也不能放行上游的旧播放功能"));
  });
  expect((await spoken(page)).length).toBe(first);
  await send(page, "继续追问，不再点击朗读");
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(first);
  await expect(page.locator("#snap-reading-status")).toBeHidden();
  expect(errors).toEqual([]);
});

test("电脑截图自动发送完成后也会朗读，窄屏按钮与停读入口可用", async ({ page }, testInfo) => {
  await open(page);
  await page.locator("#snap-read-aloud").click();
  await page.evaluate(() => { window.__speechAutoEnd = false; });
  await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(true);
  await fixture.gateway.delivery.send(fixture.gateway.delivery.target(), await fixture.gateway.native.capture(), "截图后自动朗读验证");
  await expect(page.locator("#snap-reading-status")).toBeVisible();
  await expect(page.getByRole("button", { name: "停止朗读", exact: true })).toBeVisible();
  expect((await spoken(page)).length).toBe(1);
  await page.screenshot({ path: "artifacts/read-aloud-phone-" + testInfo.project.name + ".png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 });
  for (const selector of ["#snap-connection", "#snap-read-aloud", "#snap-models"]) {
    const bounds = await page.locator(selector).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: "artifacts/read-aloud-narrow-" + testInfo.project.name + ".png", fullPage: true });
  await page.getByRole("button", { name: "停止朗读", exact: true }).click();
  await expect(page.locator("#snap-reading-status")).toBeHidden();
  await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "true");
});

test("关闭立即终止朗读，之后的回答静默；刷新记住选择且不朗读历史", async ({ page }) => {
  await open(page);
  await page.locator("#snap-read-aloud").click();
  await page.evaluate(() => { window.__speechAutoEnd = false; });
  await send(page, "检查中途关闭");
  await expect(page.locator("#snap-reading-status")).toBeVisible();
  const cancelled = await page.evaluate(() => window.__speechCancelled);
  await page.locator("#snap-read-aloud").click();
  await expect(page.locator("#snap-reading-status")).toBeHidden();
  expect(await page.evaluate(() => window.__speechCancelled)).toBeGreaterThan(cancelled);
  const count = (await spoken(page)).length;
  await send(page, "关闭后不得朗读");
  expect((await spoken(page)).length).toBe(count);
  await page.reload();
  await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "false");
  expect(await spoken(page)).toEqual([]);
  await page.locator("#snap-read-aloud").click();
  await page.reload();
  await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "true");
  expect(await spoken(page)).toEqual([]);
  await send(page, "刷新后下一轮继续自动朗读");
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
});

test("后台或切换对话不继续读，返回页面不补播旧回答", async ({ page }) => {
  await open(page);
  await page.locator("#snap-read-aloud").click();
  await page.evaluate(() => { window.__speechAutoEnd = false; });
  await send(page, "切换前的回答");
  await expect(page.locator("#snap-reading-status")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#snap-reading-status")).toBeHidden();
  const count = (await spoken(page)).length;
  await page.evaluate(() => {
    const events = new EventTarget();
    events.dispatchEvent(new CustomEvent("chat:start", { detail: { id: "background" } }));
    events.dispatchEvent(new CustomEvent("chat:finish", { detail: { id: "background", content: "后台不朗读" } }));
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect((await spoken(page)).length).toBe(count);
  await page.locator("#sidebar-toggle-button").click();
  await page.locator("#sidebar a#sidebar-new-chat-button").click();
  await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "true");
  expect((await spoken(page)).length).toBe(count);
});

test("语音失败显示行内状态，不弹窗或反复重试", async ({ page }) => {
  await open(page);
  await page.locator("#snap-read-aloud").click();
  await page.evaluate(() => { window.__speechError = true; });
  await send(page, "测试系统语音不可用");
  await expect(page.locator("#snap-reading-status")).toContainText("暂时无法朗读");
  await expect(page.locator("#snap-reading-status button")).toBeHidden();
  expect((await spoken(page)).length).toBe(1);
  await page.locator("#snap-read-aloud").click();
  await expect(page.locator("#snap-reading-status")).toBeHidden();
});

test("电脑浏览器即使保留开启偏好也无法使用手机朗读通道", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 },
    isMobile: false, hasTouch: false,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36" });
  const desktop = await context.newPage();
  try {
    await desktop.addInitScript(mockSpeech);
    await desktop.addInitScript(() => localStorage.setItem("snap.readAloud", "true"));
    await open(desktop);
    await expect(desktop.locator("#snap-read-aloud")).toBeHidden();
    await desktop.evaluate(() => {
      window.__snapReadAloud.enable(true);
      window.__snapReadAloud.speak(new SpeechSynthesisUtterance("电脑不得朗读"));
      speechSynthesis.speak(new SpeechSynthesisUtterance("上游不得朗读"));
    });
    await send(desktop, "电脑仍然静默");
    expect(await spoken(desktop)).toEqual([]);
  } finally { await context.close(); }
});

test("缺少系统语音 API 时禁用开关，并说明不支持", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
  });
  await open(page);
  await expect(page.locator("#snap-read-aloud")).toBeVisible();
  await expect(page.locator("#snap-read-aloud")).toBeDisabled();
  await expect(page.locator("#snap-read-aloud")).toHaveAttribute("title", "当前浏览器不支持语音朗读");
  await send(page, "不支持语音时仍可正常问答");
  expect(await spoken(page)).toEqual([]);
});

test("系统增强音色自动优选，试听不打开自动朗读，设置面板适配窄屏", async ({ page }, testInfo) => {
  await open(page);
  await page.getByRole("button", { name: "朗读声音与语速", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "让声音听着更舒服" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#snap-voice-select option:checked")).toContainText("中文声线（增强）");
  await expect(page.locator("#snap-speech-rate")).toHaveValue("0.95");
  expect(await spoken(page)).toEqual([]);
  await page.evaluate(() => { window.__speechAutoEnd = false; });
  await page.getByRole("button", { name: "试听声音", exact: true }).click();
  await expect(page.getByRole("button", { name: "停止试听", exact: true })).toBeVisible();
  expect((await spoken(page)).at(-1)).toMatchObject({ voice: "mock:zh-enhanced", rate: 0.95, pitch: 1 });
  await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({ path: "artifacts/voice-settings-phone-" + testInfo.project.name + ".png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 });
  for (const selector of ["#snap-voice-select", "#snap-speech-rate", "#snap-voice-preview"]) {
    const bounds = await page.locator(selector).boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: "artifacts/voice-settings-narrow-" + testInfo.project.name + ".png", fullPage: true });
  const cancelled = await page.evaluate(() => window.__speechCancelled);
  await page.getByRole("button", { name: "关闭声音设置" }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => window.__speechCancelled)).toBeGreaterThan(cancelled);
  await expect(page.getByRole("button", { name: "朗读声音与语速", exact: true })).toBeFocused();
  const count = (await spoken(page)).length;
  await send(page, "试听后仍然默认静默");
  expect((await spoken(page)).length).toBe(count);
});

test("手动音色与语速记住选择，每轮回答和刷新后都使用同一设置", async ({ page }) => {
  await open(page);
  await page.locator("#snap-voice-settings").click();
  await page.locator("#snap-voice-select").selectOption("mock:zh-basic");
  await page.locator("#snap-speech-rate").focus();
  await page.locator("#snap-speech-rate").press("ArrowLeft");
  await page.locator("#snap-speech-rate").press("ArrowLeft");
  await expect(page.locator("#snap-speech-rate")).toHaveValue("0.85");
  await page.getByRole("button", { name: "试听声音", exact: true }).click();
  await expect.poll(async () => (await spoken(page)).length).toBe(1);
  expect((await spoken(page))[0]).toMatchObject({ voice: "mock:zh-basic", rate: 0.85 });
  await page.getByRole("button", { name: "关闭声音设置" }).click();
  await page.locator("#snap-read-aloud").click();
  await send(page, "请使用选好的声音与速度");
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(1);
  expect((await spoken(page)).every(call => call.voice === "mock:zh-basic" && call.rate === 0.85)).toBe(true);
  await expect(page.locator("#snap-reading-status")).toBeHidden();
  await page.reload();
  await expect(page.locator("#snap-read-aloud")).toHaveAttribute("aria-pressed", "true");
  expect(await spoken(page)).toEqual([]);
  await send(page, "刷新后继续用这个声音");
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
  expect((await spoken(page)).every(call => call.voice === "mock:zh-basic" && call.rate === 0.85)).toBe(true);
});

test("延迟加载声音会更新列表，已选音色暂不可用时自动回退且恢复后保留", async ({ page }) => {
  await page.addInitScript(() => {
    window.__speechVoices = [];
    localStorage.setItem("snap.speechVoice", "mock:zh-late");
  });
  await open(page);
  await page.locator("#snap-voice-settings").click();
  await expect(page.locator("#snap-voice-description")).toContainText("暂不可用");
  await expect(page.locator("#snap-voice-select option")).toHaveCount(1);
  await page.evaluate(() => {
    window.__speechVoices = [{ name: "后来载入的中文自然声", lang: "zh-CN", voiceURI: "mock:zh-late" }];
    speechSynthesis.dispatchEvent(new Event("voiceschanged"));
  });
  await expect(page.locator("#snap-voice-select")).toHaveValue("mock:zh-late");
  await page.getByRole("button", { name: "试听声音", exact: true }).click();
  await expect.poll(async () => (await spoken(page)).length).toBe(1);
  expect((await spoken(page))[0].voice).toBe("mock:zh-late");
  await page.evaluate(() => {
    window.__speechVoices = [{ name: "备用中文自然声", lang: "zh-CN", voiceURI: "mock:zh-fallback" }];
    speechSynthesis.dispatchEvent(new Event("voiceschanged"));
  });
  await expect(page.locator("#snap-voice-select")).toHaveValue("");
  await expect(page.locator("#snap-voice-description")).toContainText("自动优选");
  await expect(page.getByRole("button", { name: "试听声音", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "试听声音", exact: true }).click();
  await expect.poll(async () => (await spoken(page)).length).toBe(2);
  expect((await spoken(page)).at(-1).voice).toBe("mock:zh-fallback");
  expect(await page.evaluate(() => localStorage.getItem("snap.speechVoice"))).toBe("mock:zh-late");
});

test("未授权的脚本试听与电脑音色面板保持禁用", async ({ page, browser }) => {
  await open(page);
  const accepted = await page.evaluate(() => window.__snapReadAloud.preview(new SpeechSynthesisUtterance("不得自动试听"), new Event("click")));
  expect(accepted).toBe(false);
  expect(await spoken(page)).toEqual([]);
  const context = await browser.newContext({ isMobile: false, hasTouch: false,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36" });
  try {
    const desktop = await context.newPage();
    await desktop.addInitScript(mockSpeech);
    await open(desktop);
    await expect(desktop.locator("#snap-voice-settings")).toBeHidden();
    await desktop.evaluate(() => {
      document.addEventListener("click", event => window.__snapReadAloud.preview(new SpeechSynthesisUtterance("电脑不得试听"), event), { once: true });
    });
    await desktop.mouse.click(5, 300);
    expect(await spoken(desktop)).toEqual([]);
  } finally { await context.close(); }
});
