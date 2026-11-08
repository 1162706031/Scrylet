// Prepare the sole Node service / phone experience without Python.
const path = require("node:path"),
  { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "phone/tsconfig.json"],
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--config",
    "phone/vite.config.mts",
  ],
  ...(process.platform === "win32"
    ? [["scripts/build-native.cjs", "--verify"]]
    : []),
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log(
  "Node 服务与手机页面已准备，无需 Python。运行 npm start；独立开发数据使用 npm run start:node -- --data <绝对路径>。",
);
