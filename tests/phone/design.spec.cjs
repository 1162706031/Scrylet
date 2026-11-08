const { test, expect } = require("@playwright/test");
const { nodePhone } = require("./fixture.cjs");
const { open, send } = require("./helpers.cjs");
const { mockSpeech } = require("./mock-speech.cjs");
let fixture;
test.beforeAll(async () => { fixture = await nodePhone(); });
test.afterAll(async () => fixture?.stop());
test.beforeEach(async ({ page }) => { await fixture.resetDevices(); await page.addInitScript(mockSpeech); });

async function fits(page) {
  const viewport = page.viewportSize();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const selector of [".app-header", ".composer", "#chat-input", "#send-message-button", "#snap-capture", "#snap-crop", '[aria-label="当前模型"]']) {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box.x, selector).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y, selector).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, selector).toBeLessThanOrEqual(viewport.height + 1);
  }
}

test("Phone redesign: welcome actions, 320/375/390/430 layouts and growing draft keep a single composer", async ({ page }, info) => {
  await open(page, fixture);
  await expect(page.getByRole("heading", { name: "把问题，聊清楚。" })).toBeVisible();
  const before = await fixture.count();
  await page.getByRole("button", { name: /从一个问题开始/ }).click();
  await expect(page.locator("#chat-input")).toBeFocused();
  const short = await page.locator("#chat-input").evaluate(node => node.clientHeight);
  await page.locator("#chat-input").fill("中文 English mixed draft\n".repeat(60));
  await expect.poll(() => page.locator("#chat-input").evaluate(node => node.clientHeight)).toBeGreaterThan(short);
  for (const viewport of [{ width: 320, height: 720 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 390, height: 460 }]) {
    await page.setViewportSize(viewport);
    await expect(async () => fits(page)).toPass();
    await page.screenshot({ path: info.outputPath(`draft-${viewport.width}x${viewport.height}.png`), animations: "disabled" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#chat-input").fill("");
  await expect.poll(() => page.locator("#chat-input").evaluate(node => node.clientHeight)).toBe(short);
  await page.locator("#chat-input").blur();
  await page.locator(".history-scroll").evaluate(node => { node.scrollTop = 0; });
  await expect(page.locator(".latest")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(845);
  expect(await fixture.count()).toBe(before);
  expect(await page.locator(".composer").count()).toBe(1);
  await page.screenshot({ path: info.outputPath("welcome.png"), animations: "disabled" });
});

test("Phone redesign: long Markdown stays contained; scrolling up during streaming stays put and latest returns", async ({ page }, info) => {
  await open(page, fixture);
  const title = "怎样把复杂的问题拆成清晰的步骤？";
  await send(page, fixture, title + "\n\n" + "请结合例子详细讲解，保留中英文、公式和代码。".repeat(55));
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(async () => fits(page)).toPass();
    const boxes = await page.locator(".code-block, .table-scroll, .message-parts").evaluateAll(nodes => nodes.map(node => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })));
    for (const box of boxes) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.locator(".message.assistant").first().evaluate(node => { const container = node.closest(".history-scroll"); container.scrollTop += node.getBoundingClientRect().top - container.getBoundingClientRect().top; });
  await page.screenshot({ path: info.outputPath("conversation.png"), animations: "disabled" });
  await page.getByRole("button", { name: "打开历史对话" }).click();
  await expect(page.locator('a[aria-current="page"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("history.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.getByLabel("当前模型").selectOption("openai.cancel");
  await page.locator("#chat-input").fill("继续逐步展开");
  await page.locator("#send-message-button").click();
  const answer = page.locator(".message.assistant .message-parts").last();
  await expect.poll(() => answer.innerText()).not.toBe("");
  await page.locator(".history-scroll").evaluate(node => { node.scrollTop = 0; });
  await expect(page.getByRole("button", { name: "跳到最新回复" })).toBeVisible();
  const length = (await answer.innerText()).length;
  await expect.poll(async () => (await answer.innerText()).length).toBeGreaterThan(length + 12);
  expect(await page.locator(".history-scroll").evaluate(node => node.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "跳到最新回复" }).click();
  await expect.poll(() => page.locator(".history-scroll").evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(64);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".streaming-caret")).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "停止生成" }).click();
  await expect(page.getByRole("button", { name: "停止生成" })).toBeHidden();
});
