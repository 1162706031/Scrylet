const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const { nodePhone } = require("./fixture.cjs");
const { png, open, send, graph } = require("./helpers.cjs");
let fixture;
test.beforeAll(async () => { fixture = await nodePhone(); });
test.afterAll(async () => fixture?.stop());
test.beforeEach(async () => fixture.resetDevices());
test("M2.2 edit cancel/save/send, regenerate choices, images and transient branch navigation match legacy", async ({ page }, info) => {
  await open(page, fixture); await page.getByLabel("选择图片").setInputFiles({ name: "题图.png", mimeType: "image/png", buffer: png }); await expect(page.locator(".attachment")).toHaveCount(1);
  const id = await send(page, fixture, "原问题"), initial = await graph(page, id), before = await fixture.count();
  await page.locator(".message.user").getByRole("button", { name: "编辑消息", exact: true }).click(); await page.getByLabel("编辑消息内容").fill("取消的编辑"); await page.getByRole("button", { name: "取消", exact: true }).click(); expect((await graph(page, id)).messages).toEqual(initial.messages);
  for (const [role, text] of [["user", "保存但不重发的问题"], ["assistant", "保存但不重答的回答"]]) {
    await page.locator(".message." + role).getByRole("button", { name: "编辑消息", exact: true }).click(); await page.getByLabel("编辑消息内容").fill(text); await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByRole("dialog", { name: "编辑消息", exact: true })).toBeHidden();
  }
  const saved = await graph(page, id); expect(saved.messages.map(m => m.id)).toEqual(initial.messages.map(m => m.id)); expect(saved.messages[0].parts.filter(p => p.type === "image")).toEqual(initial.messages[0].parts.filter(p => p.type === "image")); expect(await fixture.count()).toBe(before);
  await page.getByLabel("重新生成", { exact: true }).click(); await page.getByRole("button", { name: "添加详情", exact: true }).click(); await expect.poll(() => fixture.count()).toBe(before + 1); await expect.poll(async () => (await graph(page, id)).messages.length).toBe(3); await expect(page.getByRole("button", { name: "停止生成" })).toBeHidden();
  expect(await fixture.app.evaluate(() => JSON.stringify(globalThis.phoneFixture.mock.requests.at(-1).body).includes("补充细节"))).toBe(true);
  await page.locator(".message.user").getByRole("button", { name: "编辑消息", exact: true }).click(); await page.getByLabel("编辑消息内容").fill("编辑后发送的新问题"); await page.getByRole("dialog", { name: "编辑消息", exact: true }).getByRole("button", { name: "发送", exact: true }).click(); await expect.poll(() => fixture.count()).toBe(before + 2); await expect(page.getByRole("button", { name: "停止生成" })).toBeHidden();
  const edited = await graph(page, id); expect(edited.messages).toHaveLength(5); for (const old of initial.messages) expect(edited.messages.some(m => m.id === old.id)).toBe(true); expect(edited.messages.filter(m => m.role === "user").every(m => m.parts.some(p => p.type === "image"))).toBe(true);
  await page.locator(".message.user").getByLabel("上一条消息").click(); await expect(page.locator(".message.user")).toContainText("保存但不重发的问题"); expect((await graph(page, id)).currentMessageId).toBe(edited.currentMessageId); await page.reload(); await expect(page.locator(".message.user")).toContainText("编辑后发送的新问题");
  await page.screenshot({ path: info.outputPath("message-branches.png"), fullPage: true });
  const code = page.waitForEvent("download"); await page.getByRole("button", { name: "保存代码", exact: true }).click(); const result = await code; await result.saveAs(info.outputPath("code.py")); expect(fs.readFileSync(info.outputPath("code.py"), "utf8")).toContain("print(3 ** 2");
  page.once("dialog", dialog => dialog.accept()); await page.locator(".message.user").getByRole("button", { name: "删除消息", exact: true }).click(); await expect.poll(async () => (await graph(page, id)).messages.length).toBe(3); expect(await fixture.count()).toBe(before + 2);
});
test("M2.2 conversation menus rename/pin/unread/clone/share/export/archive/restore/delete with explicit confirmations", async ({ page }, info) => {
  await open(page, fixture); const id = await send(page, fixture, "管理入口题目"), before = await fixture.count();
  const panel = page.getByRole("dialog", { name: "历史对话", exact: true });
  const history = async () => { if (!(await panel.isVisible())) await page.getByRole("button", { name: "打开历史对话" }).click(); };
  const menu = async title => { await history(); await panel.getByRole("button", { name: "对话菜单 " + title, exact: true }).click(); };
  await menu("管理入口题目"); await panel.getByRole("button", { name: "重命名", exact: true }).click(); await panel.getByLabel("对话标题").fill("题目 · 已重命名"); await panel.getByRole("button", { name: "保存标题" }).click(); await expect(panel.getByRole("link", { name: /题目 · 已重命名/ })).toBeVisible();
  await menu("题目 · 已重命名"); await panel.getByRole("button", { name: "置顶", exact: true }).click(); await expect.poll(async () => (await graph(page, id)).pinned).toBe(true);
  await menu("题目 · 已重命名"); await panel.getByRole("button", { name: "标记为未读" }).click(); await expect.poll(async () => (await graph(page, id)).lastReadAt).toBe(0); await panel.getByRole("button", { name: "标记全部已读" }).click(); await expect.poll(async () => (await graph(page, id)).lastReadAt > 0).toBe(true);
  await panel.getByLabel("搜索对话").fill("不匹配的字符串"); await expect(panel.getByText("还没有匹配的对话")).toBeVisible(); await panel.getByLabel("搜索对话").fill("题目 · 已重命名"); await expect(panel.getByRole("link", { name: /题目 · 已重命名/ })).toBeVisible();
  await menu("题目 · 已重命名"); await panel.getByRole("button", { name: "分享", exact: true }).click(); await expect(panel.getByRole("dialog", { name: "分享对话", exact: true })).toBeVisible(); await expect(panel.getByLabel("对话链接")).toHaveValue(fixture.url + "/c/" + id); await panel.getByRole("button", { name: "关闭", exact: true }).click();
  for (const format of ["JSON", "TXT", "PDF"]) {
    await menu("题目 · 已重命名"); const waiting = page.waitForEvent("download"); await panel.getByRole("button", { name: "下载 " + format, exact: true }).click(); const file = await waiting; const target = info.outputPath("export." + format.toLowerCase()); await file.saveAs(target); const bytes = fs.readFileSync(target);
    if (format === "JSON") { const value = JSON.parse(bytes); expect(value[0].id).toBe(id); expect(Object.keys(value[0].chat.history.messages)).toHaveLength(2); }
    else if (format === "TXT") expect(bytes.toString()).toContain("管理入口题目");
    else expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  }
  await menu("题目 · 已重命名"); await panel.getByRole("button", { name: "克隆", exact: true }).click(); await expect(page).not.toHaveURL(new RegExp(id + "$")); expect(await fixture.count()).toBe(before);
  const clonedId = new URL(page.url()).pathname.split("/").at(-1); expect((await graph(page, clonedId)).messages).toHaveLength(2);
  await history(); await panel.getByLabel("搜索对话").fill("题目 · 已重命名"); await menu("题目 · 已重命名"); await panel.getByRole("button", { name: "归档", exact: true }).click(); await expect.poll(async () => (await graph(page, id)).archived).toBe(true);
  await panel.getByRole("button", { name: "已归档", exact: true }).click(); await menu("题目 · 已重命名"); await panel.getByRole("button", { name: "恢复归档", exact: true }).click(); await expect.poll(async () => (await graph(page, id)).archived).toBe(false); await panel.getByRole("button", { name: "对话", exact: true }).click();
  await menu("题目 · 已重命名"); page.once("dialog", dialog => dialog.dismiss()); await panel.getByRole("button", { name: "删除对话", exact: true }).click(); expect((await graph(page, id)).id).toBe(id);
  await menu("题目 · 已重命名"); page.once("dialog", dialog => dialog.accept()); await panel.getByRole("button", { name: "删除对话", exact: true }).click(); await expect.poll(async () => page.evaluate(async id => (await fetch("/snap/api/chats/" + id)).status, id)).toBe(404); expect(await fixture.count()).toBe(before);
});
test("M2 message/code/top copy uses current text and clipboard refusal stays recoverable", async ({ page }) => {
  await open(page, fixture); const errors = []; page.on("pageerror", error => errors.push(error.message)); await send(page, fixture, "复制测试问题");
  await page.evaluate(() => { window.copiedText = []; Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { window.copiedText.push(value); } } }); });
  await page.locator(".message.user").getByRole("button", { name: "复制", exact: true }).click(); expect(await page.evaluate(() => window.copiedText.at(-1))).toBe("复制测试问题");
  await page.getByRole("button", { name: "复制代码", exact: true }).click(); expect(await page.evaluate(() => window.copiedText.at(-1))).toContain("print(3 ** 2");
  await page.getByLabel("对话操作", { exact: true }).click(); await page.getByRole("button", { name: "复制对话", exact: true }).click(); expect(await page.evaluate(() => window.copiedText.at(-1))).toContain("复制测试问题");
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw Error("DENIED"); } } }); document.execCommand = () => false; });
  await page.locator(".message.user").getByRole("button", { name: "复制", exact: true }).click(); await expect(page.getByText("复制失败，请长按选择文字复制", { exact: true })).toBeVisible(); expect(errors).toEqual([]);
});
