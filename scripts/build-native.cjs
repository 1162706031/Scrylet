const fs = require("node:fs"),
  path = require("node:path");
const { spawnSync } = require("node:child_process");
const { inspectPe } = require("./native-binary.cjs");
const { observerProgram } = require("../desktop/native-program.cjs");
const root = path.resolve(__dirname, ".."),
  toolchain = "1.91.0",
  target = "x86_64-pc-windows-gnu";
function buildNative({ verify = false } = {}) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw Error(
      "原生 observer 目前只构建 Windows x64；Mac 长按 capability=false",
    );
  const output = path.join(root, "build/native/win32-x64");
  if (!verify) {
    const cargo = process.env.SNAP_CARGO || "cargo";
    const result = spawnSync(
      cargo,
      [
        "+" + toolchain + "-" + target,
        "build",
        "--locked",
        "--release",
        "--target",
        target,
        "--target-dir",
        path.join(root, "build/native-target"),
      ],
      {
        cwd: path.join(root, "native"),
        stdio: "inherit",
        windowsHide: true,
        env: { ...process.env, CARGO_INCREMENTAL: "0" },
      },
    );
    if (result.error || result.status !== 0)
      throw Error(
        "Rust 构建失败；需要锁定的 1.91.0 Windows GNU 工具链，不在运行时下载 / 编译",
      );
    fs.mkdirSync(output, { recursive: true });
    for (const name of ["input-observer", "test-input-driver"])
      fs.copyFileSync(
        path.join(
          root,
          "build/native-target",
          target,
          "release",
          name + ".exe",
        ),
        path.join(output, name + ".exe"),
      );
    fs.copyFileSync(
      path.join(root, "native/NOTICE.txt"),
      path.join(output, "NOTICE.txt"),
    );
    const rustc = path.isAbsolute(cargo)
      ? path.join(path.dirname(cargo), "rustc.exe")
      : "rustc";
    const sysroot = spawnSync(
      rustc,
      ["+" + toolchain + "-" + target, "--print", "sysroot"],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (sysroot.status !== 0)
      throw Error("Rust runtime license source unavailable");
    fs.mkdirSync(path.join(output, "licenses"), { recursive: true });
    for (const file of ["COPYRIGHT.html", "COPYRIGHT-library.html"])
      fs.copyFileSync(
        path.join(sysroot.stdout.trim(), "share/doc/rust", file),
        path.join(output, "licenses", file),
      );
    const metadata = (name) => {
      const value = inspectPe(path.join(output, name + ".exe"));
      if (value.arch !== "x64") throw Error("NATIVE_WRONG_ARCH");
      return value;
    };
    fs.writeFileSync(
      path.join(output, "manifest.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          protocolVersion: 1,
          platform: "win32",
          arch: "x64",
          coordinateSpace: "physical",
          globalMouse: true,
          toolchain,
          target,
          files: { "input-observer.exe": metadata("input-observer") },
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(output, "test-manifest.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          testOnly: true,
          toolchain,
          target,
          files: { "test-input-driver.exe": metadata("test-input-driver") },
        },
        null,
        2,
      ),
    );
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(output, "manifest.json")),
  );
  observerProgram(
    {
      nativeDirectory: output,
      observer: path.join(output, "input-observer.exe"),
    },
    { platform: "win32", arch: "x64" },
  );
  if (!fs.existsSync(path.join(output, "licenses/COPYRIGHT-library.html")))
    throw Error("Native runtime license missing");
  for (const [file, expected] of Object.entries(manifest.files))
    if (
      JSON.stringify(inspectPe(path.join(output, file))) !==
      JSON.stringify(expected)
    )
      throw Error("NATIVE_HASH_OR_ARCH_MISMATCH");
  return { directory: output, ...manifest };
}
if (require.main === module) {
  try {
    console.log(
      JSON.stringify(
        buildNative({ verify: process.argv.includes("--verify") }),
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { buildNative };
