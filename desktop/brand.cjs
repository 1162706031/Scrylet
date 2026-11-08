const fs = require("node:fs");
const path = require("node:path");

const NAME = "Scrylet";
// Preserve the installed application identity so NSIS upgrades the old app.
const APP_ID = "com.snapsolver.desktop";

function legacyDataDirectory(appData) {
  return path.join(appData, "Snap-Solver");
}

function dataDirectory(appData, override, engine = "node") {
  if (override) return path.resolve(override);
  if (engine !== "node") throw new Error("此版本仅支持 Node 聊天服务");
  return path.join(appData, NAME);
}

function migrationSource(appData, override, explicitSource) {
  if (explicitSource) return path.resolve(explicitSource);
  if (override) return null;
  const target = dataDirectory(appData, override);
  if (fs.existsSync(path.join(target, "chat-node/v1/migration.json"))) return null;
  const source = legacyDataDirectory(appData);
  return fs.existsSync(path.join(source, "open-webui/webui.db")) ? source : null;
}

module.exports = { NAME, APP_ID, dataDirectory, legacyDataDirectory, migrationSource };
