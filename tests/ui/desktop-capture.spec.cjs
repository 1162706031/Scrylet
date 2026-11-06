const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFixture } = require("../fixture.cjs");

let fixture, directory;
test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-desktop-delivery-"));
  fixture = await createFixture(directory);
});
test.afterAll(async () => {
  await fixture?.stop();
  if (directory) await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test("电脑截图和默认提示词由手机原生聊天框自动发送且只有一次", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#chat-input")).toBeVisible({ timeout: 60000 });
  await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(true);
  const before = fixture.requests.length;
  const capture = await fixture.gateway.native.capture();
  const prompt = "请识别这张电脑截图中的题目，并给出完整解题过程。";
  const receipt = await fixture.gateway.delivery.send(fixture.gateway.delivery.target(), capture, prompt);
  expect(receipt.success).toBe(true);
  await expect.poll(() => fixture.requests.length).toBe(before + 1);
  await expect(page.getByText(before ? "追问已收到。" : "截图已收到。", { exact: false })).toBeVisible({ timeout: 45000 });
  const request = fixture.requests.at(-1);
  const parts = request.messages.flatMap((message) => Array.isArray(message.content) ? message.content : []);
  expect(parts.filter((part) => part.type === "image_url")).toHaveLength(1);
  expect(JSON.stringify(request.messages)).toContain(prompt);
  await expect(page.getByRole("button", { name: "停止", exact: true })).toHaveCount(0);
  await expect(page.locator("#snap-toast")).toBeHidden();
  await page.screenshot({ path: "test-results/desktop-auto-send-" + testInfo.project.name + ".png", fullPage: true });
  expect(fixture.requests.length).toBe(before + 1);
  expect(errors).toEqual([]);
});

test("回答生成中不自动提交第二次截图", async ({ page }) => {
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#chat-input")).toBeVisible({ timeout: 60000 });
  await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(true);
  await page.locator("#chat-input").fill("慢速测试");
  await page.locator("#send-message-button").click();
  await expect(page.getByRole("button", { name: "停止", exact: true })).toBeVisible();
  await expect.poll(() => fixture.gateway.delivery.status().reason).toContain("生成回答");
  expect(() => fixture.gateway.delivery.target()).toThrow(/生成回答/);
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(true);
});

for (const showCaptureHints of [false, true]) test(`图片已加入后暂停访问时，兼容提示参数 ${showCaptureHints} 仍静默处理发送失败`, async ({ page }) => {
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#chat-input")).toBeVisible({ timeout: 60000 });
  await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(true);
  const before = fixture.requests.length;
  await page.route("**/snap/api/desktop/validate", async (route) => {
    fixture.gateway.pause(true);
    await route.continue();
  });
  const sent = fixture.gateway.delivery.send(fixture.gateway.delivery.target(), await fixture.gateway.native.capture(), "暂停前的提示词", { showCaptureHints });
  await expect(sent).rejects.toThrow(/暂停/);
  await expect(page.locator("#snap-toast")).toBeHidden();
  expect(fixture.requests.length).toBe(before);
  await expect(page.locator("#chat-input")).toContainText("暂停前的提示词");
  fixture.gateway.pause(false);
});

test("旧版提示参数不再显示手机提示", async ({ page }) => {
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#chat-input")).toBeVisible({ timeout: 60000 });
  await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(true);
  const before = fixture.requests.length;
  await fixture.gateway.delivery.send(fixture.gateway.delivery.target(), await fixture.gateway.native.capture(), "启用提示的电脑截图", { showCaptureHints: true });
  await expect.poll(() => fixture.requests.length).toBe(before + 1);
  await expect(page.locator("#snap-toast")).toBeHidden();
  await expect(page.getByRole("button", { name: "停止", exact: true })).toHaveCount(0);
});

test("接收指令途中切换对话，不会把旧截图发送到新对话", async ({ page }) => {
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#chat-input")).toBeVisible({ timeout: 60000 });
  await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(true);
  const before = fixture.requests.length;
  await page.route("**/snap/api/desktop/poll", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (data.command) {
      await page.evaluate(() => {
        const link = document.querySelector("#sidebar-new-chat-button,#new-chat-button");
        if (!link) throw new Error("Missing upstream new-chat action");
        link.click();
      });
    }
    await route.fulfill({ response, json: data });
  });
  const sent = fixture.gateway.delivery.send(fixture.gateway.delivery.target(), await fixture.gateway.native.capture(), "旧对话的提示词");
  await expect(sent).rejects.toThrow(/切换/);
  await expect(page.locator("#message-input-container .snap-attachment")).toHaveCount(0);
  expect(fixture.requests.length).toBe(before);
});

test("手机草稿保留，电脑不替它发送；用户发送草稿后恢复接收", async ({ page }) => {
  await page.goto(fixture.pairingUrl);
  const editor = page.locator("#chat-input");
  await expect(editor).toBeVisible({ timeout: 60000 });
  await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(true);
  await editor.fill("这是一段未发送的手机草稿");
  await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(false);
  expect(fixture.gateway.delivery.status().reason).toContain("草稿");
  const before = fixture.requests.length;
  expect(() => fixture.gateway.delivery.target()).toThrow(/草稿/);
  await expect(editor).toContainText("这是一段未发送的手机草稿");
  expect(fixture.requests.length).toBe(before);
  await page.locator("#send-message-button").click();
  await expect.poll(() => fixture.requests.length).toBe(before + 1);
  await expect(page.getByRole("button", { name: "停止", exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("");
  await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(true);
});

test("旧通知偏好和旧截图参数也不能播放声音、振动或弹出通知", async ({ page }, testInfo) => {
  const preferences = await fixture.runtime.request("/api/v1/users/user/settings");
  await fixture.runtime.request("/api/v1/users/user/settings/update", {
    method: "POST", body: { ...preferences, ui: { ...preferences.ui, notificationSound: true,
      notificationSoundAlways: true, notificationEnabled: true, hapticFeedback: true,
      responseAutoPlayback: true } },
  });
  await page.addInitScript(() => {
    window.__feedbackCalls = { media: 0, webAudio: 0, notification: 0, permission: 0, vibration: 0, speech: 0, alert: 0 };
    HTMLMediaElement.prototype.play = function () { window.__feedbackCalls.media++; return Promise.resolve(); };
    for (const Source of [window.AudioScheduledSourceNode, window.AudioBufferSourceNode]) {
      if (Source) Source.prototype.start = function () { window.__feedbackCalls.webAudio++; };
    }
    window.Notification = class extends EventTarget {
      constructor() { super(); window.__feedbackCalls.notification++; }
      static get permission() { return "granted"; }
      static requestPermission() { window.__feedbackCalls.permission++; return Promise.resolve("granted"); }
    };
    navigator.vibrate = () => { window.__feedbackCalls.vibration++; return true; };
    if (window.speechSynthesis) speechSynthesis.speak = () => { window.__feedbackCalls.speech++; };
    window.alert = () => { window.__feedbackCalls.alert++; };
  });
  // A cached older command must not enable feedback in the receiver either.
  await page.route("**/snap/api/desktop/poll", async route => {
    const response = await route.fetch();
    const data = await response.json();
    if (data.command) data.command.showCaptureHints = true;
    await route.fulfill({ response, json: data });
  });
  try {
    await page.goto(fixture.pairingUrl);
    await expect(page.locator("#snap-capture")).toBeEnabled({ timeout: 60000 });
    await expect.poll(() => fixture.gateway.delivery.status().ready).toBe(true);
    await page.evaluate(async () => {
      await new Audio("/audio/notification.mp3").play();
      new Notification("legacy capture notification");
      await Notification.requestPermission();
      navigator.vibrate(10);
      if (window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance("legacy response"));
      if (window.AudioContext) {
        const context = new AudioContext();
        context.createOscillator().start();
        context.createBufferSource().start();
        await context.close();
      }
    });
    const before = fixture.requests.length;
    await fixture.gateway.delivery.send(fixture.gateway.delivery.target(), await fixture.gateway.native.capture(), "静默截图验证");
    await expect.poll(() => fixture.requests.length).toBe(before + 1);
    await expect(page.getByRole("button", { name: "停止", exact: true })).toHaveCount(0);
    await expect(page.locator("#snap-toast")).toBeHidden();
    await expect(page.locator("[data-sonner-toaster]")).toBeHidden();
    await expect(page.locator(".snap-just-added")).toHaveCount(0);
    expect(await page.evaluate(() => window.__feedbackCalls)).toEqual({
      media: 0, webAudio: 0, notification: 0, permission: 0, vibration: 0, speech: 0, alert: 0,
    });
    await page.screenshot({ path: "test-results/strict-quiet-" + testInfo.project.name + ".png" });
  } finally {
    await fixture.runtime.applyUiPolicy();
  }
});
