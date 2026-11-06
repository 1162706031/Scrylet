const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFixture } = require("../fixture.cjs");

let fixture, directory;
test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-pair-ui-"));
  fixture = await createFixture(directory);
});
test.afterAll(async () => {
  await fixture?.stop();
  if (directory) await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test("手机连接码支持全角与分隔粘贴，错误可恢复且需明确提交", async ({ page }) => {
  let pairingRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/snap/api/pair") pairingRequests++;
  });
  await page.goto(fixture.url + "/snap/pair");
  const input = page.locator("#credential");
  await expect(input).toHaveAttribute("inputmode", "numeric");
  await expect(input).toHaveAttribute("enterkeyhint", "go");
  const code = fixture.gateway.pairing.info().code;
  await input.fill(String((Number(code) + 1) % 1000000).padStart(6, "0"));
  await input.press("Enter");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#pair-error")).not.toBeEmpty();
  const fullWidth = [...code].map((digit) => String.fromCharCode(digit.charCodeAt(0) + 0xfee0)).join("");
  await input.evaluate((element, text) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", text.slice(0, 3) + " " + text.slice(3));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  }, fullWidth);
  await expect(input).toHaveValue(code);
  await expect(input).not.toHaveAttribute("aria-invalid");
  await expect(page.locator("#pair-error")).toBeEmpty();
  expect(pairingRequests).toBe(1);
  await input.press("Enter");
  await expect(page.locator("#chat-input")).toBeVisible({ timeout: 60000 });
  expect(pairingRequests).toBe(2);
  expect(fixture.requests).toHaveLength(0);
});
