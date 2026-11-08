const { test, expect } = require("@playwright/test");
const { nodePhone } = require("./fixture.cjs");
const { open, send } = require("./helpers.cjs");
let fixture;
test.beforeAll(async () => { fixture = await nodePhone(); });
test.afterAll(async () => fixture?.stop());
test.beforeEach(async () => fixture.resetDevices());
async function contained(page, selector, top = 0, bottom = null) {
  const box = await page.locator(selector).boundingBox(), viewport = page.viewportSize();
  expect(box, selector).not.toBeNull(); expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(top - 1); expect(box.y + box.height).toBeLessThanOrEqual((bottom ?? viewport.height) + 1);
}
test("Provider design: service list, scrollable credentials and fixed actions fit narrow and keyboard viewports", async ({ page }, info) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await open(page, fixture); const id = await send(page, fixture, "连接模型后返回这里");
  await page.locator("#chat-input").fill("配置期间保留这条草稿");
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  const count = await fixture.count();
  await page.getByRole("link", { name: "模型设置", exact: true }).click();
  await expect(page.locator(".provider-button")).toHaveCount(6);
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await page.locator("#providers").boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("model-services.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: /OpenAI/ }).click();
  await expect(page.locator("#api-key")).toHaveValue("");
  await expect(page.locator("#api-key")).toHaveAttribute("type", "password");
  await page.getByText("模型与服务地址", { exact: true }).click();
  for (const viewport of [{ width: 320, height: 720 }, { width: 375, height: 812 }, { width: 390, height: 460 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await expect(async () => { await contained(page, "#save"); await contained(page, "#close-provider"); await contained(page, "#remove"); }).toPass();
    await page.locator("#api-key").focus();
    await contained(page, "#save");
    if (viewport.height === 460) await page.screenshot({ path: info.outputPath("model-sheet-short.png"), animations: "disabled" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("model-credentials.png"), animations: "disabled" });
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 420 });
    Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 20 });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await contained(page, "#save", 20, 440); await contained(page, "#close-provider", 20, 440);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /OpenAI/ })).toBeFocused();
  await page.getByRole("button", { name: /OpenAI/ }).click();
  await page.locator("#save").click();
  await expect(page).toHaveURL(fixture.url + "/c/" + id);
  await expect(page.locator("#chat-input")).toHaveValue("配置期间保留这条草稿");
  expect(await fixture.count()).toBe(count); expect(errors).toEqual([]);
});
