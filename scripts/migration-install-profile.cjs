// Acceptance-only NSIS namespace; application appId and payload stay unchanged.
const LAB_GUID = "8ca85fef-153f-4a64-8c4f-b2bb590ced09",
  LAB_NAME = "Scrylet M4 Acceptance";
function labConfig(directory, include) {
  const config = require("./package-config.cjs").packageConfig({
    platform: "win32",
    arch: "x64",
    profile: "development",
  });
  config.directories.output = directory;
  Object.assign(config.nsis, {
    guid: LAB_GUID,
    shortcutName: LAB_NAME,
    uninstallDisplayName: LAB_NAME,
    runAfterFinish: false,
    include,
  });
  return config;
}
module.exports = { LAB_GUID, LAB_NAME, labConfig };
