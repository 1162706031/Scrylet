const test = require("node:test");
const assert = require("node:assert/strict");
const { Runtime } = require("../desktop/runtime.cjs");
const { scope } = require("../desktop/product-scope.cjs");

test("静默策略覆盖旧通知、朗读和振动设置，保留其他偏好且重复应用不写入", async () => {
  const runtime = new Runtime("unused");
  let settings = { ui: { theme: "dark", language: "zh-CN", ...Object.fromEntries(Object.keys(scope.ui).map(key => [key, true])) }, otherPreference: "keep" };
  let writes = 0;
  runtime.request = async (route, options) => {
    if (route.endsWith("/update")) {
      writes++;
      settings = options.body;
    }
    return settings;
  };
  await runtime.applyUiPolicy();
  for (const key of Object.keys(scope.ui)) assert.equal(settings.ui[key], false);
  assert.equal(settings.ui.theme, "dark");
  assert.equal(settings.otherPreference, "keep");
  assert.equal(writes, 1);
  await runtime.applyUiPolicy();
  assert.equal(writes, 1);
});
