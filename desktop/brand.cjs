const fs = require("node:fs");
const path = require("node:path");

const NAME = "Scrylet";
// Preserve the installed application identity so NSIS upgrades the old app.
const APP_ID = "com.snapsolver.desktop";

function dataDirectory(appData, override) {
  if (override) return path.resolve(override);
  const legacy = path.join(appData, "Snap-Solver");
  if (fs.existsSync(legacy) && fs.statSync(legacy).isDirectory()) return legacy;
  return path.join(appData, NAME);
}

module.exports = { NAME, APP_ID, dataDirectory };
