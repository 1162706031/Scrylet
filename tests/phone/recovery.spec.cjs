const { test, expect } = require("@playwright/test");
const { nodePhone } = require("./fixture.cjs");
const { open, graph } = require("./helpers.cjs");
const { mockSpeech } = require("./mock-speech.cjs");
let fixture;
test.beforeAll(async () => { fixture = await nodePhone(); });
test.afterAll(async () => fixture?.stop());
test.beforeEach(async ({ page }) => { await fixture.resetDevices(); await page.addInitScript(mockSpeech); });
test("M2 refresh/navigation resumes existing partial generation without model replay or historical speech", async ({ page }) => {
  await open(page, fixture); await page.locator("#snap-read-aloud").click(); await page.getByLabel("当前模型").selectOption("openai.cancel"); const before = await fixture.count();
  await page.locator("#chat-input").fill("刷新不能重发"); await page.locator("#send-message-button").click(); await expect(page.locator(".message.assistant .message-parts")).not.toBeEmpty(); const id = new URL(page.url()).pathname.split("/").at(-1), original = await graph(page, id);
  await page.reload(); await expect(page.getByRole("button", { name: "停止生成" })).toBeVisible(); await expect(page.locator(".message.assistant .message-parts")).not.toBeEmpty(); expect(await fixture.count()).toBe(before + 1); expect((await graph(page, id)).activeGeneration.id).toBe(original.activeGeneration.id);
  await page.getByRole("link", { name: "模型设置", exact: true }).click(); await page.getByRole("link", { name: "返回对话", exact: false }).click(); await expect(page.getByRole("button", { name: "停止生成" })).toBeVisible(); expect(await fixture.count()).toBe(before + 1);
  await page.getByRole("button", { name: "停止生成" }).click(); await expect(page.getByText("已停止", { exact: true })).toBeVisible(); expect((await graph(page, id)).messages).toHaveLength(2); expect(await page.evaluate(() => window.phoneSpeechCalls.filter(call => call.volume !== 0))).toEqual([]);
});
test("M2 delayed draft response cannot overwrite newer input; same-browser tab conflict preserves both pending drafts", async ({ page, context }) => {
  await open(page, fixture); let captured = false, release; const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/snap/api/drafts/new", async route => {
    if (route.request().method() !== "PUT" || captured) return route.continue(); captured = true; const result = await route.fetch(); await gate; await route.fulfill({ response: result });
  });
  await page.locator("#chat-input").fill("第一次保存"); await expect.poll(() => captured).toBe(true); await page.locator("#chat-input").fill("后输入的内容必须保留"); release(); await expect(page.getByText("已保存", { exact: true })).toBeVisible(); await expect(page.locator("#chat-input")).toHaveValue("后输入的内容必须保留");
  const second = await context.newPage(); await second.goto(fixture.url); await expect(second.locator("#chat-input")).toHaveValue("后输入的内容必须保留");
  await page.locator("#chat-input").fill("第一标签页更新"); await expect(page.getByText("已保存", { exact: true })).toBeVisible(); await second.locator("#chat-input").fill("第二标签页独立输入"); await expect(second.getByText("保存未确认", { exact: true })).toBeVisible(); await expect(second.locator("#chat-input")).toHaveValue("第二标签页独立输入"); await expect(page.locator("#chat-input")).toHaveValue("第一标签页更新"); await second.close();
});
test("M2 provider rejection is persisted, does not retry, and leaves a usable new draft", async ({ page }) => {
  await open(page, fixture); await page.getByLabel("当前模型").selectOption("openai.http-error"); const before = await fixture.count(); await page.locator("#chat-input").fill("模拟提供商失败"); await page.locator("#send-message-button").click(); await expect(page.getByText("生成失败", { exact: true })).toBeVisible();
  await page.locator("#chat-input").fill("失败后的下一条草稿"); await expect(page.getByText("已保存", { exact: true })).toBeVisible(); await page.reload(); await expect(page.locator("#chat-input")).toHaveValue("失败后的下一条草稿"); await expect(page.getByText("生成失败", { exact: true })).toBeVisible(); expect(await fixture.count()).toBe(before + 1);
});
