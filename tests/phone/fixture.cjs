const { _electron, expect } = require("@playwright/test");
const fs = require("node:fs"), path = require("node:path");
async function nodePhone() {
  const base = path.resolve(".test-data/node-service-m2"); fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "phone-"));
  const env = { ...process.env, SNAP_PHONE_TEST_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS; delete env.NODE_PATH;
  for (const provider of require("../../config/providers.json").providers) delete env[provider.envKey];
  const app = await _electron.launch({ args: [process.env.SNAP_PHONE_TEST_ASAR || path.resolve("tests/phone/main.cjs")], cwd: directory, env, timeout: 30000 });
  await expect.poll(() => fs.existsSync(path.join(directory, "fixture.json")), { timeout: 30000 }).toBe(true);
  const info = JSON.parse(fs.readFileSync(path.join(directory, "fixture.json"), "utf8"));
  if (process.env.SNAP_PHONE_TEST_ASAR) { expect(info.archive).toBe(true); expect(await app.evaluate(({ app }) => app.getAppPath().endsWith(".asar"))).toBe(true); }
  return { ...info, app, directory,
    async count() { return app.evaluate(() => globalThis.phoneFixture.mock.requests.length); },
    async receivers() { return app.evaluate(() => Array.from(globalThis.phoneFixture.gateway.delivery.receivers.values(), r => ({ clientId: r.clientId, ready: r.ready, reason: r.reasonCode, context: r.context, active: r.active }))); },
    async receiverStatus() { return app.evaluate(() => { const delivery = globalThis.phoneFixture.gateway.delivery; return { ...delivery.status(), clientId: delivery.selected }; }); },
    async command() { return app.evaluate(async () => {
      const { gateway, native } = globalThis.phoneFixture;
      try { const target = gateway.delivery.target(), image = await native.capture("1"); const result = gateway.delivery.send(target, image, "请分析截图并解释每一步"); globalThis.phoneCommandResult = { status: "pending" }; void result.then(() => { globalThis.phoneCommandResult = { status: "accepted" }; }, () => { globalThis.phoneCommandResult = { status: "failed" }; }); return true; } catch { return false; }
    }); },
    async commandResult() { return app.evaluate(() => globalThis.phoneCommandResult?.status); },
    async resetDevices() { await app.evaluate(() => { const gateway = globalThis.phoneFixture.gateway; for (const device of gateway.pairing.list()) gateway.revoke(device.id); }); },
    async stop() { await app.close(); } };
}
module.exports = { nodePhone };
