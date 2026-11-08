const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
function parse(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = {
      "--data": "data",
      "--output": "output",
      "--executable": "executable",
    }[argv[i]];
    if (!key || !argv[i + 1])
      throw Error(
        "需要 --data 新版目录 --output 独立旧版副本目录 [--executable 已安装的新版应用]",
      );
    options[key] = path.resolve(argv[++i]);
  }
  if (!options.data || !options.output)
    throw Error("必须显式指定独立数据与输出目录");
  return options;
}
function main(argv = process.argv.slice(2)) {
  const v = parse(argv),
    root = path.resolve(__dirname, "..");
  if (
    !fs.existsSync(path.join(v.data, "chat-node/v1/migration.json")) ||
    fs.existsSync(v.output)
  )
    throw Error("需要已经迁移的新数据与尚不存在的独立输出路径");
  let executable, args;
  if (v.executable) {
    executable = v.executable;
    const resources =
      process.platform === "darwin"
        ? path.resolve(path.dirname(executable), "../Resources")
        : path.join(path.dirname(executable), "resources");
    const metadata = JSON.parse(
      require("@electron/asar").extractFile(
        path.join(resources, "app.asar"),
        "package.json",
      ),
    );
    if (metadata.scryletMigrationProtocol !== 1)
      throw Error("该应用不支持当前回退协议，未启动旧版本读取新数据");
    args = [];
  } else {
    if (require("../package.json").scryletMigrationProtocol !== 1)
      throw Error("回退协议不匹配");
    executable = require("electron");
    args = [root];
  }
  const env = {
    ...process.env,
    SNAP_RUNTIME_ENGINE: "node",
    SNAP_DATA_DIR: v.data,
  };
  for (const k of [
    "ELECTRON_RUN_AS_NODE",
    "NODE_OPTIONS",
    "NODE_PATH",
    "SNAP_MIGRATION_SOURCE",
  ])
    delete env[k];
  for (const p of require("../config/providers.json").providers)
    delete env[p.envKey];
  fs.mkdirSync(path.dirname(v.output), { recursive: true, mode: 0o700 });
  const result = spawnSync(
    executable,
    [...args, "--scrylet-export-legacy", v.output],
    { env, cwd: path.dirname(v.output), stdio: "inherit", windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw Error("回退副本未通过；旧库和新库均未替换");
  const report = JSON.parse(
    fs.readFileSync(path.join(v.output, "rollback.json")),
  );
  if (report.status !== "rollback-validated") throw Error("回退副本未验证");
  return report;
}
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { main, parse };
