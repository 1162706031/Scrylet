const { test, expect } = require("@playwright/test");
const { nodePhone } = require("./fixture.cjs");
const { png, open, images } = require("./helpers.cjs");
let fixture;
test.beforeAll(async () => { fixture = await nodePhone(); });
test.afterAll(async () => fixture?.stop());
test.beforeEach(async () => fixture.resetDevices());
test("M2.2 screenshot, ordered attachments, preview zoom, append undo and persisted draft", async ({ page }, info) => {
  await open(page, fixture); const before = await fixture.count();
  await page.locator("#chat-input").fill("保留我输入的问题"); await page.getByLabel("选择截屏屏幕").selectOption("2");
  await page.locator("#snap-capture").click(); await expect(page.locator(".attachment")).toHaveCount(1);
  await page.getByLabel("选择图片").setInputFiles({ name: "手机图片.png", mimeType: "image/png", buffer: png }); await expect(page.locator(".attachment")).toHaveCount(2);
  const original = await images(page); await expect(page.locator("#chat-input")).toHaveValue("保留我输入的问题"); expect(await fixture.count()).toBe(before);
  await page.getByRole("button", { name: "预览第 1 张图片" }).click(); await page.getByRole("button", { name: "放大图片" }).click(); await expect(page.getByText("150%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一张", exact: true }).click(); await expect(page.getByAltText("大图预览")).toHaveAttribute("src", original[1]); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "移除第 1 张图片" }).click(); await page.getByRole("button", { name: "撤销删除", exact: true }).click(); expect(await images(page)).toEqual([original[1], original[0]]);
  await expect(page.getByText("已保存", { exact: true })).toBeVisible(); await page.reload(); await expect(page.locator("#chat-input")).toHaveValue("保留我输入的问题"); expect(await images(page)).toEqual([original[1], original[0]]); await expect(page.getByLabel("选择截屏屏幕")).toHaveValue("2");
  await page.getByRole("button", { name: "清空待发送图片" }).click(); await expect(page.locator(".attachment")).toHaveCount(0); await page.getByRole("button", { name: "撤销删除", exact: true }).click(); await expect(page.locator(".attachment")).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("draft-images.png"), fullPage: true }); expect(await fixture.count()).toBe(before);
});
test("M2.2 whole-batch limit, processing blocks Enter, failure keeps draft and late image cannot cross navigation", async ({ page }) => {
  await open(page, fixture); const before = await fixture.count(); await page.locator("#chat-input").fill("不要误发");
  await page.getByLabel("选择图片").setInputFiles(Array.from({ length: 13 }, (_, i) => ({ name: i + ".png", mimeType: "image/png", buffer: png })));
  await expect(page.getByRole("alert")).toContainText("整批未添加"); await expect(page.locator(".attachment")).toHaveCount(0);
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/snap/api/capture", async route => { await gate; await route.continue(); });
  await page.locator("#snap-capture").click(); await expect(page.locator("#send-message-button")).toBeDisabled(); await page.locator("#chat-input").press("Enter"); expect(await fixture.count()).toBe(before);
  await page.getByRole("button", { name: "新对话", exact: true }).click(); release(); await expect(page.locator(".attachment")).toHaveCount(0); await expect(page.locator("#chat-input")).toHaveValue("不要误发");
  await page.unroute("**/snap/api/capture"); await page.route("**/snap/api/files?*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "STORAGE_FAILED", error: "暂时无法保存图片" }) }));
  await page.getByLabel("选择图片").setInputFiles({ name: "失败.png", mimeType: "image/png", buffer: png }); await expect(page.getByRole("alert")).toContainText("暂时无法保存图片"); await expect(page.locator("#chat-input")).toHaveValue("不要误发"); expect(await fixture.count()).toBe(before);
});
test("M2.2 crop dimensions reuse, display retake and append without submitting", async ({ page }, info) => {
  await open(page, fixture); const before = await fixture.count(); await page.locator("#snap-crop").click();
  await expect(page.locator("#snap-attach")).toBeEnabled(); await page.getByRole("button", { name: "重置选区" }).click(); await page.getByRole("button", { name: "添加选区到对话" }).click(); await expect(page.locator(".attachment")).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("snap.crop.1"))); expect(saved.width).toBe(1440); expect(saved.data.width).toBeGreaterThan(24);
  await page.locator("#snap-crop").click(); await expect(page.locator("#snap-attach")).toBeEnabled(); await page.getByLabel("选择电脑屏幕").selectOption("2"); await expect(page.locator("#snap-attach")).toBeEnabled();
  await page.screenshot({ path: info.outputPath("crop.png"), fullPage: true }); await page.getByRole("button", { name: "添加选区到对话" }).click(); await expect(page.locator(".attachment")).toHaveCount(2); expect(await fixture.count()).toBe(before);
});
test("M2.2 legacy inline and uploaded image formats migrate with raw metadata; unresolved image blocks send", async ({ page }) => {
  const data = "data:image/png;base64," + png.toString("base64");
  await page.addInitScript(({ data }) => {
    if (location.pathname !== "/" || sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "yes");
    sessionStorage.setItem("chat-input", JSON.stringify({ prompt: "旧格式草稿不能丢", files: [{ type: "image", url: data }, { type: "file", id: "not-yet-mapped", url: "/api/v1/files/not-yet-mapped/content", file: { meta: { name: "旧上传.png" } } }], selectedToolIds: ["disabled-unknown"], customUnknown: { preserve: true } })); sessionStorage.setItem("selectedModels", JSON.stringify(["openai.fixture-model"]));
  }, { data });
  await open(page, fixture); const before = await fixture.count(); await expect(page.locator("#chat-input")).toHaveValue("旧格式草稿不能丢"); await expect(page.locator(".attachment")).toHaveCount(2);
  await page.locator("#send-message-button").click(); await expect(page.getByRole("alert")).toContainText("尚未迁移"); expect(await fixture.count()).toBe(before);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("chat-input")).customUnknown.preserve)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("snap.legacyDraft.done.v1:new"))).toBeNull();
  await page.reload(); await expect(page.locator("#chat-input")).toHaveValue("旧格式草稿不能丢"); await expect(page.locator(".attachment")).toHaveCount(2); expect(await fixture.count()).toBe(before);
});
test("M2.2 complete legacy inline import marks only after saved, keeps source and expands slash prompt without sending", async ({ page }) => {
  const raw = JSON.stringify({ prompt: "完整旧草稿", files: [{ type: "image", url: "data:image/png;base64," + png.toString("base64") }], unknown: { retain: true } });
  await page.addInitScript(raw => { if (location.pathname === "/" && !sessionStorage.getItem("seed")) { sessionStorage.setItem("seed", "yes"); sessionStorage.setItem("chat-input", raw); } }, raw);
  await open(page, fixture); await expect(page.locator("#chat-input")).toHaveValue("完整旧草稿"); await expect(page.locator(".attachment")).toHaveCount(1); await expect.poll(() => page.evaluate(() => localStorage.getItem("snap.legacyDraft.done.v1:new"))).toBe(raw);
  expect(await page.evaluate(() => sessionStorage.getItem("chat-input"))).toBe(raw); const before = await fixture.count();
  await page.locator("#chat-input").fill("/snap-"); await expect(page.getByRole("listbox", { name: "提示词建议" })).toBeVisible(); await page.locator("#chat-input").press("Enter"); await expect(page.locator("#chat-input")).not.toHaveValue("/snap-"); expect(await fixture.count()).toBe(before); await expect(page.locator(".attachment")).toHaveCount(1);
});
