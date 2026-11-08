const { test, expect } = require("@playwright/test");
const { nodePhone } = require("./fixture.cjs");
const { open, graph } = require("./helpers.cjs");
let fixture;
test.beforeAll(async () => { fixture = await nodePhone(); });
test.afterAll(async () => fixture?.stop());
test.beforeEach(async () => fixture.resetDevices());
async function ready(clientId) { await expect.poll(async () => { const state = await fixture.receiverStatus(); return state.ready && (!clientId || state.clientId === clientId); }).toBe(true); }
test("M2.3 single composer receives desktop image and prompt, durable acceptance and no replay after lost ack", async ({ page }) => {
  await open(page, fixture); await ready(); const before = await fixture.count();
  await page.route("**/snap/api/desktop/ack", route => route.abort());
  expect(await fixture.command()).toBe(true);
  await expect.poll(() => fixture.count()).toBe(before + 1); await expect(page.locator(".message.user")).toContainText("请分析截图并解释每一步"); await expect(page.locator(".message.user img")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "停止生成" })).toBeHidden(); await expect(page.locator("#chat-input")).toHaveValue("");
  const chatId = new URL(page.url()).pathname.split("/").at(-1); const saved = await graph(page, chatId); expect(saved.messages).toHaveLength(2);
  expect(await fixture.commandResult()).toBe("pending");
  await fixture.app.evaluate(() => { const delivery = globalThis.phoneFixture.gateway.delivery; delivery.finish(delivery.pending, new Error("TEST_ACK_DEADLINE")); });
  await expect.poll(() => fixture.commandResult()).toBe("failed"); await page.reload(); await ready();
  expect(await fixture.count()).toBe(before + 1); expect((await graph(page, chatId)).messages).toHaveLength(2);
});
test("M2.3 rejects existing draft, generation, modal and hidden page; pause keeps upstream alive", async ({ page }) => {
  await open(page, fixture); await ready(); const before = await fixture.count();
  await page.locator("#chat-input").fill("保留已有草稿"); await expect.poll(async () => (await fixture.receivers()).some(r => r.reason === "draft")).toBe(true); expect(await fixture.command()).toBe(false);
  await page.locator("#chat-input").fill(""); await ready(); await page.getByRole("button", { name: "打开历史对话" }).click(); await expect.poll(async () => (await fixture.receivers()).some(r => r.reason === "busy")).toBe(true); expect(await fixture.command()).toBe(false); await page.keyboard.press("Escape"); await ready();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); }); await expect.poll(async () => (await fixture.receivers()).some(r => r.reason === "hidden")).toBe(true); expect(await fixture.command()).toBe(false);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); }); await ready();
  await page.getByLabel("当前模型").selectOption("openai.cancel"); await page.locator("#chat-input").fill("暂停不应停止"); await page.locator("#send-message-button").click(); await expect.poll(() => fixture.count()).toBe(before + 1); await expect.poll(async () => (await fixture.receivers()).some(r => r.reason === "generating")).toBe(true); expect(await fixture.command()).toBe(false);
  const chatId = new URL(page.url()).pathname.split("/").at(-1); const saved = await graph(page, chatId), generationId = saved.activeGeneration.id;
  await fixture.app.evaluate(() => globalThis.phoneFixture.gateway.pause(true)); await expect(page.getByText(/电脑已暂停/).first()).toBeVisible();
  expect(await fixture.app.evaluate(async (_electron, id) => { const { runtime, gateway } = globalThis.phoneFixture; return (await (await fetch(runtime.url + "/snap/api/generations/" + id, { headers: { authorization: "Bearer " + runtime.credential, "x-scrylet-device": gateway.pairing.list()[0].id } })).json()).status; }, generationId)).toBe("streaming");
  await fixture.app.evaluate(() => globalThis.phoneFixture.gateway.pause(false)); await expect(page.locator("#snap-capture")).toBeEnabled(); await page.getByRole("button", { name: "停止生成" }).click(); await expect(page.getByText("已停止", { exact: true })).toBeVisible(); expect(await fixture.count()).toBe(before + 1);
});
test("M2.3 late foreground tab is the sole receiver and mid-upload revision/navigation change refuses send", async ({ page, context }) => {
  const firstPoll = page.waitForRequest(request => request.url().endsWith("/snap/api/desktop/poll"));
  await open(page, fixture); const first = (await firstPoll).postDataJSON().clientId;
  await expect.poll(async () => (await fixture.receivers()).find(r => r.clientId === first)?.ready).toBe(true);
  const second = await context.newPage(), secondPoll = second.waitForRequest(request => request.url().endsWith("/snap/api/desktop/poll")); await second.goto(fixture.url); const secondId = (await secondPoll).postDataJSON().clientId; await expect(second.locator("#snap-capture")).toBeEnabled(); await second.bringToFront(); await second.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(async () => (await fixture.receivers()).length).toBe(2);
  await ready(secondId);
  const before = await fixture.count(); expect(await fixture.command()).toBe(true); await expect.poll(() => fixture.count()).toBe(before + 1); await expect(second.locator(".message.user")).toHaveCount(1); await expect(page.locator(".message.user")).toHaveCount(0); await expect.poll(() => fixture.commandResult()).toBe("accepted");
  await second.close(); await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await ready(first);
  let release; const gate = new Promise(resolve => { release = resolve; }); await page.route("**/snap/api/files?*", async route => { await gate; await route.continue(); });
  expect(await fixture.command()).toBe(true); await expect.poll(async () => (await fixture.receivers()).find(r => r.clientId === first)?.reason).toBe("busy");
  await page.locator("#chat-input").fill("图片处理中新增的草稿"); release(); await expect.poll(() => fixture.commandResult()).toBe("failed"); await expect(page.locator("#chat-input")).toHaveValue("图片处理中新增的草稿"); expect(await fixture.count()).toBe(before + 1);
});
test("M2.3 uncertain POST uses receipt lookup only, persists across refresh and manual confirmation never resubmits", async ({ page }) => {
  await open(page, fixture); const before = await fixture.count(); let posts = 0;
  await page.route(/\/snap\/api\/chats\/[A-Za-z0-9_-]+\/messages$/, async route => { posts++; await route.fetch(); await route.abort(); });
  await page.route("**/snap/api/requests/*", route => route.abort());
  await page.locator("#chat-input").fill("只发送一次"); await page.locator("#send-message-button").click(); await expect.poll(() => fixture.count()).toBe(before + 1); await expect(page.getByText(/发送结果待确认/).first()).toBeVisible(); expect(posts).toBe(1);
  await page.reload(); await expect(page.getByText(/发送结果待确认/).first()).toBeVisible(); await expect(page.locator("#send-message-button")).toBeDisabled(); expect(posts).toBe(1);
  await page.unroute("**/snap/api/requests/*"); await page.getByRole("button", { name: "检查发送状态" }).click(); await expect(page.locator(".message.assistant")).toHaveCount(1); await expect(page.locator("#chat-input")).toHaveValue(""); expect(posts).toBe(1); expect(await fixture.count()).toBe(before + 1);
});
