const { NAME, APP_ID } = require("../desktop/brand.cjs");
function packageConfig({
  platform = process.platform,
  arch = process.arch,
  profile = "development",
} = {}) {
  if (!["win32", "darwin"].includes(platform) ||
      (platform === "win32" ? arch !== "x64" : !["x64", "arm64"].includes(arch)))
    throw Error("不支持的打包平台 / 架构");
  if (!["development", "distribution", "node-candidate"].includes(profile) ||
      (platform === "darwin" && profile === "node-candidate"))
    throw Error("未知的打包 profile");
  const config = {
    appId: APP_ID, productName: NAME, executableName: NAME,
    asar: true, npmRebuild: false,
    directories: { output: "dist", buildResources: "packaging" },
    files: [
      "desktop/**/*.cjs", "desktop/ui/**/*", "web/**/*",
      "config/providers.json", "config/prompts.json", "config/product-scope.json",
      "package.json", "LICENSE", "THIRD_PARTY_NOTICES.md",
      "service/**/*.cjs", "service/migrations/schema/*.sql",
      "service/migrations/legacy-schema.json", "contracts/**/*.cjs", "contracts/http-v1.json",
      { from: "build/phone", to: "phone-dist", filter: ["**/*"] },
      "!desktop/legacy-*.cjs", "!**/*.py", "!**/*.pyc",
      "!node_modules/http-proxy/**/*", "!node_modules/requires-port/**/*",
    ],
    extraResources: [
      { from: "THIRD_PARTY_NOTICES.md", to: "THIRD_PARTY_NOTICES.md" },
      { from: "LICENSE", to: "LICENSE.txt" },
    ],
    extraMetadata: {
      scryletRuntimeDefault: "node",
      scryletBuild: {
        platform, arch, profile,
        runtime: profile === "node-candidate" ? "node-candidate" : "node",
        mouseObserver: true, normalUserDataMigration: true,
      },
    },
    win: {
      target: [{ target: "nsis", arch: ["x64"] }], icon: "packaging/icon.ico",
      artifactName: NAME + "-${version}-win-${arch}-Setup.${ext}",
    },
    nsis: {
      oneClick: false, perMachine: false, allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true, createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false,
      installerLanguages: ["zh_CN", "en_US"], language: "2052", license: "LICENSE",
      runAfterFinish: true,
    },
  };
  if (platform === "win32") {
    config.extraResources.push({
      from: "build/native/win32-x64", to: "native/win32-x64",
      filter: ["input-observer.exe", "manifest.json", "NOTICE.txt", "licenses/**/*"],
    });
    if (profile === "node-candidate") {
      const { LAB_GUID, LAB_NAME } = require("./migration-install-profile.cjs");
      Object.assign(config.nsis, {
        guid: LAB_GUID, shortcutName: LAB_NAME, uninstallDisplayName: LAB_NAME,
        runAfterFinish: false, include: "packaging/node-candidate.nsh",
      });
    }
  } else {
    config.extraResources.push({
      from: "build/native/darwin-" + arch, to: "native/darwin-" + arch,
      filter: ["input-observer", "manifest.json", "NOTICE.txt", "licenses/**/*"],
    });
    config.mac = {
      target: ["dmg", "zip"], icon: "packaging/icon.icns",
      category: "public.app-category.productivity",
      artifactName: NAME + "-${version}-mac-${arch}.${ext}",
      extendInfo: {
        NSLocalNetworkUsageDescription: "连接同一局域网中已配对的手机。",
        NSScreenCaptureUsageDescription: "仅在你截屏时读取屏幕，将图片发到已配对手机。",
      },
    };
    config.dmg = {
      title: NAME + " ${version}", format: "UDZO",
      contents: [
        { x: 130, y: 220, type: "file" },
        { x: 410, y: 220, type: "link", path: "/Applications" },
      ],
    };
  }
  return config;
}
module.exports = { packageConfig };
