const path = require("node:path");

function runtimePaths({
  root = path.resolve(__dirname, ".."), resourcesPath = process.resourcesPath,
  platform = process.platform, pythonOverride = process.env.SNAP_PYTHON,
} = {}) {
  const packaged = Boolean(resourcesPath && /(?:^|[\\/])app\.asar$/.test(root));
  return {
    packaged,
    python: pythonOverride || (packaged
      ? path.join(resourcesPath, "python", platform === "win32" ? "python.exe" : "bin/python3")
      : path.join(root, ".runtime", platform === "win32" ? "Scripts/python.exe" : "bin/python")),
    launcher: packaged ? path.join(resourcesPath, "runtime/launch.py") : path.join(root, "runtime/launch.py"),
    mouse: packaged ? path.join(resourcesPath, "runtime/mouse-input.py") : path.join(root, "desktop/mouse-input.py"),
  };
}

module.exports = { runtimePaths };
