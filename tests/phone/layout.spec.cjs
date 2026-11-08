const { test, expect } = require("@playwright/test");
const { nodePhone } = require("./fixture.cjs");
const { png, open, send } = require("./helpers.cjs");
const { mockSpeech } = require("./mock-speech.cjs");
let fixture;
test.beforeAll(async () => { fixture = await nodePhone(); });
test.afterAll(async () => fixture?.stop());
test.beforeEach(async ({ page }) => { await fixture.resetDevices(); await page.addInitScript(mockSpeech); });
async function inside(page, selector, height = null) {
  await expect(async () => { const box = await page.locator(selector).boundingBox(), viewport = page.viewportSize(); expect(box).not.toBeNull(); expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1); expect(box.y).toBeGreaterThanOrEqual(-1); expect(box.y + box.height).toBeLessThanOrEqual((height || viewport.height) + 1); }).toPass({ timeout: 5000 });
}
test("M2.5 320-wide, 390x460, long draft and multi-image composer keep actions reachable and render local resources", async ({ page }, info) => {
  const external = []; await page.route("**/*", route => { const url = new URL(route.request().url()); if (!["127.0.0.1", ""].includes(url.hostname) && ["http:", "https:"].includes(url.protocol)) { external.push(url.hostname); return route.abort(); } return route.continue(); });
  await open(page, fixture); await send(page, fixture, "布局题目");
  await page.locator("#chat-input").fill("长草稿：" + "保留用户输入与数学推理。".repeat(220));
  await page.getByLabel("选择图片").setInputFiles(Array.from({ length: 8 }, (_, i) => ({ name: "图片-" + i + ".png", mimeType: "image/png", buffer: png }))); await expect(page.locator(".attachment")).toHaveCount(8);
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 720 }, { width: 390, height: 460 }]) {
    await page.setViewportSize(viewport); await inside(page, "#send-message-button"); await inside(page, "#chat-input"); await inside(page, "#snap-capture"); await inside(page, "#snap-read-aloud");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`phone-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "朗读声音与语速" }).click(); await inside(page, ".voice-dialog"); await page.keyboard.press("Escape"); await expect(page.locator("#snap-voice-settings")).toBeFocused(); expect(external).toEqual([]);
});
test("M2.5 VisualViewport shrink/offset and zoom retain draft, stable focus and accessible modal controls", async ({ page }, info) => {
  await open(page, fixture); await page.locator("#chat-input").fill("键盘前后的输入");
  await page.evaluate(() => { const viewport = new EventTarget(); Object.assign(viewport, { height: 450, width: 390, offsetTop: 0, scale: 1 }); Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport }); window.dispatchEvent(new Event("resize")); });
  await inside(page, "#send-message-button", 450); await page.locator("#chat-input").focus(); await page.getByRole("button", { name: "朗读声音与语速" }).click(); await inside(page, ".voice-dialog", 450);
  await page.keyboard.press("Tab"); expect(await page.evaluate(() => document.querySelector(".voice-dialog").contains(document.activeElement))).toBe(true); await page.keyboard.press("Escape"); await expect(page.locator("#snap-voice-settings")).toBeFocused();
  const before = await page.evaluate(() => document.documentElement.style.getPropertyValue("--phone-height")); await page.evaluate(() => { visualViewport.scale = 2; visualViewport.height = 220; window.dispatchEvent(new Event("resize")); }); expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--phone-height"))).toBe(before);
  await expect(page.locator("#chat-input")).toHaveValue("键盘前后的输入"); await page.screenshot({ path: info.outputPath("visual-viewport.png"), fullPage: true });
});
test("M2.5 provider sheet keeps key private, preserves blank key, deletes explicitly and returns to original chat/draft", async ({ page }, info) => {
  await open(page, fixture); const id = await send(page, fixture, "设置返回原对话"), before = await fixture.count(); await page.locator("#chat-input").fill("配置时也不能丢失的草稿"); await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "模型设置", exact: true }).click(); await page.getByRole("button", { name: /OpenAI/ }).click(); await expect(page.locator("#api-key")).toHaveValue(""); await expect(page.locator("#api-key")).toHaveAttribute("type", "password");
  await page.setViewportSize({ width: 390, height: 460 }); await page.locator("#api-key").focus(); await inside(page, "#save"); await inside(page, "#close-provider"); await page.screenshot({ path: info.outputPath("model-sheet.png"), fullPage: true });
  await page.locator("#save").click(); await expect(page).toHaveURL(fixture.url + "/c/" + id); await expect(page.locator("#chat-input")).toHaveValue("配置时也不能丢失的草稿"); expect(await fixture.count()).toBe(before);
  await page.getByRole("link", { name: "模型设置", exact: true }).click(); await page.getByRole("button", { name: /OpenAI/ }).click(); page.once("dialog", dialog => dialog.accept()); await page.locator("#remove").click(); await expect(page).toHaveURL(fixture.url + "/c/" + id); await expect(page.locator("#chat-input")).toHaveValue("配置时也不能丢失的草稿"); await expect(page.locator("#send-message-button")).toBeDisabled(); expect(await fixture.count()).toBe(before);
  expect(await fixture.app.evaluate(async () => (await globalThis.phoneFixture.runtime.providers()).providers.find(p => p.id === "openai").configured)).toBe(false);
});
test("M2.5 startup/failure/pause/revocation retain URL and draft with explicit recovery", async ({ page }, info) => {
  await open(page, fixture); const id = await send(page, fixture, "恢复到原位置"); await page.locator("#chat-input").fill("恢复草稿"); await expect(page.getByText("已保存", { exact: true })).toBeVisible(); const before = await fixture.count();
  await fixture.app.evaluate(() => { const runtime = globalThis.phoneFixture.runtime; runtime.ready = false; runtime.error = "隔离模拟服务故障"; }); await expect(page.getByText("等待恢复连接", { exact: true })).toBeVisible(); await expect(page.locator("#chat-input")).toHaveValue("恢复草稿"); await expect(page.locator("#send-message-button")).toBeDisabled(); await page.screenshot({ path: info.outputPath("waiting.png"), fullPage: true });
  await fixture.app.evaluate(() => { const runtime = globalThis.phoneFixture.runtime; runtime.ready = true; runtime.error = ""; }); await expect(page.locator("#snap-capture")).toBeEnabled(); expect(page.url()).toBe(fixture.url + "/c/" + id);
  await fixture.app.evaluate(() => globalThis.phoneFixture.gateway.pause(true)); await page.reload(); await expect(page.locator("#connection-state")).toContainText("手机访问已暂停"); expect(page.url()).toBe(fixture.url + "/c/" + id); await fixture.app.evaluate(() => globalThis.phoneFixture.gateway.pause(false)); await page.locator("#connection-retry").click(); await expect(page.locator("#chat-input")).toHaveValue("恢复草稿");
  await fixture.resetDevices(); await page.reload(); await expect(page).toHaveURL(/\/snap\/pair\?returnTo=/); await page.goto(fixture.pairingUrl.replace("/snap/pair#", "/snap/pair?returnTo=" + encodeURIComponent("/c/" + id) + "#")); await expect(page).toHaveURL(fixture.url + "/c/" + id); await expect(page.locator("#chat-input")).toHaveValue("恢复草稿"); expect(await fixture.count()).toBe(before);
});
