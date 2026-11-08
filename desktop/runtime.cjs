// The Node service is the only runtime. Old databases are imported read-only.
const metadata = require("../package.json");
function runtimeDefault(manifest = metadata) {
  if (manifest.scryletRuntimeDefault !== "node")
    throw new Error("此版本仅支持 Node 聊天服务；旧版请使用独立旧安装包与数据副本");
  return "node";
}
class Runtime {
  constructor(directory, options = {}) {
    const engine = options.engine || process.env.SNAP_RUNTIME_ENGINE || runtimeDefault();
    if (engine !== "node")
      throw new Error("此版本仅支持 Node 聊天服务；旧版请使用独立旧安装包与数据副本");
    return new (require("./node-runtime.cjs").NodeRuntime)(directory, options);
  }
}
module.exports = { Runtime, runtimeDefault };
