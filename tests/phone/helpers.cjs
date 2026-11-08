const { expect } = require("@playwright/test");
// Synthetic 96x64 RGB PNG with valid chunk CRCs, decoded by both browser engines.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAAhElEQVR4nO3QMQ2AMAAAwcrBDy4RxogChjpg7Tdc8gI+N+7n1Udj+UE8QIAAAQIUDhAgQIAAhQMECBAgQOEAAQIEaE+g47z2ChAgQIAAhQMECBAgQOEAAQIECFA4QIAAAQIUDhCgvYB+EiBAgAABCgcIECBAgMIBAgQIEKBwgAABArSyCctmq/h1CcYCAAAAAElFTkSuQmCC", "base64");
async function open(page, fixture) { await page.goto(fixture.pairingUrl); await expect(page.locator("#snap-capture")).toBeEnabled(); }
async function send(page, fixture, text) {
  const count = await fixture.count(); await page.locator("#chat-input").fill(text); await page.locator("#send-message-button").click();
  await expect.poll(() => fixture.count()).toBe(count + 1); await expect(page.getByRole("button", { name: "停止生成" })).toBeHidden();
  await expect.poll(async () => page.locator(".message.assistant .message-actions").last().getByRole("button", { name: "编辑消息", exact: true }).count()).toBe(1);
  return new URL(page.url()).pathname.split("/").at(-1);
}
async function graph(page, chatId) { return page.evaluate(async id => (await fetch("/snap/api/chats/" + id)).json(), chatId); }
async function images(page) { return page.locator(".attachment img").evaluateAll(nodes => nodes.map(node => node.getAttribute("src"))); }
module.exports = { png, open, send, graph, images };
