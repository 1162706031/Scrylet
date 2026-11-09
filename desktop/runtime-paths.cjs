const path = require("node:path");

function runtimePaths({
  root = path.resolve(__dirname, ".."), resourcesPath = process.resourcesPath,
  platform = process.platform, arch = process.arch,
} = {}) {
  const packaged = Boolean(resourcesPath && /(?:^|[\\/])app\.asar$/.test(root));
  return {
    packaged,
    service: path.join(root, "service/main.cjs"),
    nativeDirectory: packaged ? path.join(resourcesPath, "native", platform + "-" + arch) : path.join(root, "build/native", platform + "-" + arch),
    observer: ((platform === "win32" && arch === "x64") || (platform === "darwin" && ["arm64", "x64"].includes(arch)))
      ? path.join(packaged ? resourcesPath : path.join(root, "build"), "native", platform + "-" + arch, platform === "win32" ? "input-observer.exe" : "input-observer")
      : null,
  };
}

module.exports = { runtimePaths };
