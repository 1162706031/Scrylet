const { NAME, APP_ID } = require("./desktop/brand.cjs");
module.exports = {
  appId: APP_ID,
  productName: NAME,
  executableName: NAME,
  asar: true,
  npmRebuild: false,
  directories: { output: "dist", buildResources: "packaging" },
  files: [
    "desktop/**/*.cjs", "desktop/ui/**/*", "web/**/*", "config/providers.json",
    "config/prompts.json", "config/product-scope.json", "package.json", "LICENSE", "THIRD_PARTY_NOTICES.md",
  ],
  extraResources: [
    { from: "build/python", to: "python" },
    { from: "runtime/launch.py", to: "runtime/launch.py" },
    { from: "desktop/mouse-input.py", to: "runtime/mouse-input.py" },
    { from: "runtime/requirements.lock", to: "runtime/requirements.lock" },
    { from: "THIRD_PARTY_NOTICES.md", to: "THIRD_PARTY_NOTICES.md" },
    { from: "LICENSE", to: "LICENSE.txt" },
  ],
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "packaging/icon.ico",
    artifactName: NAME + "-${version}-win-${arch}-Setup.${ext}",
  },
  nsis: {
    oneClick: false, perMachine: false, allowElevation: false,
    allowToChangeInstallationDirectory: true, createDesktopShortcut: true,
    createStartMenuShortcut: true, deleteAppDataOnUninstall: false,
    installerLanguages: ["zh_CN", "en_US"], language: "2052",
    license: "LICENSE", runAfterFinish: true,
  },
};
