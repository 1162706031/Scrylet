const path = require("node:path"),
  { spawn } = require("node:child_process");
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--data" || !path.isAbsolute(args[1]))
  throw Error("需要 --data 绝对路径的独立 Node 数据目录");
const env = {
  ...process.env,
  SNAP_RUNTIME_ENGINE: "node",
  SNAP_DATA_DIR: path.resolve(args[1]),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
delete env.NODE_PATH;
const child = spawn(require("electron"), [path.resolve(__dirname, "..")], {
  env,
  stdio: "inherit",
});
child.once("error", () => {
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
