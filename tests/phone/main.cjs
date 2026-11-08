// Isolated acceptance entry; never loaded by the application or exposed as HTTP RPC.
const { app } = require("electron");
const fs = require("node:fs"), path = require("node:path");
const { NodeRuntime } = require("../../desktop/node-runtime.cjs");
const { Gateway } = require("../../desktop/gateway.cjs");
const { protocolProvider } = require("../fixtures/protocol-provider.cjs");
const directory = process.env.SNAP_PHONE_TEST_DIR;
if (!directory || !path.isAbsolute(directory)) process.exit(2);
fs.mkdirSync(directory, { recursive: true }); app.setPath("userData", directory);
let runtime, gateway, mock, captureCount = 0;
app.whenReady().then(async () => {
  mock = await protocolProvider({ answer: "## 看清楚每一步\n\n由 $a^2+b^2=c^2$ 得到 **c = 5**。\n\n| 边 | 长度 |\n|---|---|\n| a | 3 |\n| b | 4 |\n\n```python\nprint(3 ** 2 + 4 ** 2)\n```\n\n[安全链接](https://example.invalid)\n<script>alert('unsafe')</script>\n" });
  runtime = new NodeRuntime(directory); await runtime.start();
  for (const [providerId, apiType] of [["openai", "responses"], ["alibaba", "chat"]]) await runtime.saveProvider(providerId, { apiVersion: 1, providerId, apiType, revision: 0, baseUrl: mock.baseURL, keyAction: "set", apiKey: "synthetic-phone-only", modelIds: ["fixture-model", "cancel", "http-error", "uncertain"] });
  const native = { permission: () => "granted", displays: () => [{ id: "1", name: "测试屏幕", width: 1440, height: 900, primary: true }, { id: "2", name: "第二块屏幕", width: 1280, height: 720, primary: false }],
    capture: async displayId => { captureCount++; return { displayId: displayId === "2" ? "2" : "1", width: 1440, height: 900,
      image: "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="#edf2ff"/><text x="150" y="300" font-size="70">Screenshot ${captureCount}</text><text x="150" y="430" font-size="60">a = 3, b = 4, c = ?</text></svg>`).toString("base64") }; } };
  gateway = new Gateway(directory, native, runtime); await gateway.start();
  const url = `http://127.0.0.1:${gateway.port}`;
  fs.writeFileSync(path.join(directory, "fixture.json"), JSON.stringify({ url, pairingUrl: url + "/snap/pair#token=" + gateway.pairing.info().token, archive: __filename.includes(".asar" + path.sep) }));
  globalThis.phoneFixture = { runtime, gateway, mock, capture: () => captureCount, native };
}).catch(() => app.exit(1));
let closing = false;
app.on("before-quit", event => { if (closing) return; event.preventDefault(); closing = true; Promise.resolve(runtime?.stop()).finally(() => gateway?.close()).finally(() => mock?.stop()).finally(() => app.exit(0)); });
