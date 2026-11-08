const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const file = path.join(dir, item.name);
    return item.isDirectory() ? walk(file) : [file];
  });
}
for (const directory of ["desktop", "web", "scripts", "tests", "contracts", "service"]) {
  for (const file of walk(path.join(root, directory)).filter((file) =>
    /\.(cjs|js)$/.test(file),
  )) {
    const result = spawnSync(process.execPath, ["--check", file], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
const catalog = require("../config/providers.json");
const ids = new Set();
for (const provider of catalog.providers) {
  if (
    ids.has(provider.id) ||
    !provider.models.length ||
    new URL(provider.baseUrl).protocol !== "https:"
  )
    throw new Error("模型目录格式错误");
  ids.add(provider.id);
}
const scope = require("../config/product-scope.json");
if (!Number.isSafeInteger(scope.maxImages) || scope.maxImages < 1)
  throw new Error("附件上限必须是正整数");
if (fs.existsSync(path.join(root, "phone/tsconfig.json"))) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", "phone/tsconfig.json"],
    { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
const contracts = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", "contracts/tsconfig.json"],
  { cwd: root, stdio: "inherit" });
if (contracts.status !== 0) process.exit(contracts.status || 1);
console.log("JavaScript 语法、模型目录、产品开关、phone 与 contracts 严格类型检查通过。");
