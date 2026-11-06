const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFixture } = require("../fixture.cjs");
let fixture, directory;
test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-ui-"));
  fixture = await createFixture(directory);
});
test.afterAll(async () => {
  await fixture?.stop();
  if (directory) await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test("Scrylet 配对页与应用图标可加载，聊天保留 Open WebUI 署名", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(fixture.url + "/snap/pair");
  await expect(page).toHaveTitle("连接电脑 · Scrylet");
  await expect(page.locator(".brand")).toHaveText("Scrylet");
  await expect.poll(() => page.locator(".brand img").evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  for (const asset of ["icon.svg", "icon.png", "apple-touch-icon.png", "trayTemplate.png"])
    expect((await page.request.get(fixture.url + "/snap/assets/brand/" + asset)).status()).toBe(200);
  await page.screenshot({ path: "artifacts/scrylet-pair-" + testInfo.project.name + ".png", fullPage: true });
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#snap-capture")).toBeEnabled({ timeout: 60000 });
  await expect(page).toHaveTitle(/Scrylet/);
  await expect(page.locator("#snap-connection")).toBeVisible();
  await page.screenshot({ path: "artifacts/scrylet-phone-" + testInfo.project.name + ".png", fullPage: true });
  expect(errors).toEqual([]);
});

test("Scrylet 模型设置与等待页保留品牌和上游署名", async ({ page }, testInfo) => {
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#snap-capture")).toBeEnabled({ timeout: 60000 });
  await page.goto(fixture.url + "/snap/models");
  await expect(page).toHaveTitle("模型服务 · Scrylet");
  await expect(page.locator("footer")).toHaveText("Scrylet ＋ Open WebUI");
  await page.screenshot({ path: "artifacts/scrylet-models-" + testInfo.project.name + ".png", fullPage: true });
  fixture.gateway.pause(true);
  try {
    await page.goto(fixture.url);
    await expect(page).toHaveTitle("等待电脑 · Scrylet");
    await expect(page.locator(".brand")).toHaveText("Scrylet");
    await expect(page.locator("footer")).toHaveText("Scrylet ＋ Open WebUI");
  } finally { fixture.gateway.pause(false); }
});
