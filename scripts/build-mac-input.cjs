// Build the same Rust observer crate for Mac and verify its package resource manifest.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { inspectMachO, observerProgram } = require("../desktop/native-program.cjs");
const root = path.resolve(__dirname, ".."), toolchain = "1.91.0";
function cargoToolchain() {
  if (process.env.SNAP_CARGO) return { cargo: process.env.SNAP_CARGO, env: process.env };
  const cargoHome = path.join(root, ".test-data/cargo-home");
  const rustupHome = path.join(root, ".test-data/rustup-home");
  const localCargo = path.join(cargoHome, "bin/cargo");
  if (fs.existsSync(localCargo) && fs.existsSync(rustupHome)) return {
    cargo: localCargo, env: { ...process.env, CARGO_HOME: cargoHome, RUSTUP_HOME: rustupHome },
  };
  return { cargo: "cargo", env: process.env };
}
function command(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: path.join(root, "native"), stdio: "inherit", ...options });
  if (result.error?.code === "ENOENT") throw Error("MAC_INPUT_RUST_BUILD_FAILED: Cargo 未安装或不在 PATH；请安装 Rust 1.91.0，或设置 SNAP_CARGO 为 cargo 的绝对路径");
  if (result.error || result.status !== 0) throw Error("MAC_INPUT_RUST_BUILD_FAILED: " + program + " exited with " + (result.error?.code || result.status));
  return result;
}
function build(arch = process.arch) {
  if (process.platform !== "darwin" || !["arm64", "x64"].includes(arch)) throw Error("MAC_INPUT_BUILD_PLATFORM");
  const { cargo, env } = cargoToolchain();
  const target = arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  const directory = path.join(root, "build/native/darwin-" + arch);
  const observer = path.join(directory, "input-observer");
  command(cargo, ["+" + toolchain, "build", "--locked", "--release", "--package", "input-observer",
    "--target", target, "--target-dir", path.join(root, "build/native-target")],
    { env: { ...env, CARGO_INCREMENTAL: "0" } });
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(path.join(root, "build/native-target", target, "release/input-observer"), observer);
  fs.chmodSync(observer, 0o755);
  const file = inspectMachO(observer);
  if (file.arch !== arch) throw Error("MAC_INPUT_ARCH_MISMATCH");
  const rustc = path.isAbsolute(cargo) ? path.join(path.dirname(cargo), "rustc") : "rustc";
  const sysroot = spawnSync(rustc, ["+" + toolchain, "--print", "sysroot"], { cwd: path.join(root, "native"), encoding: "utf8", env });
  if (sysroot.error || sysroot.status !== 0) throw Error("MAC_RUST_LICENSE_SOURCE_MISSING");
  const licenseDir = path.join(directory, "licenses");
  fs.mkdirSync(licenseDir, { recursive: true });
  for (const name of ["COPYRIGHT.html", "COPYRIGHT-library.html"])
    fs.copyFileSync(path.join(sysroot.stdout.trim(), "share/doc/rust", name), path.join(licenseDir, name));
  fs.copyFileSync(path.join(root, "native/MAC_NOTICE.txt"), path.join(directory, "NOTICE.txt"));
  const sources = ["native/input-observer/src/main.rs", "native/input-observer/src/macos.rs", "native/input-observer/Cargo.toml"];
  const sourceSha256 = crypto.createHash("sha256");
  for (const source of sources) sourceSha256.update(fs.readFileSync(path.join(root, source)));
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
    schemaVersion: 1, protocolVersion: 1, platform: "darwin", arch,
    coordinateSpace: "dip", globalMouse: true, toolchain, target,
    files: { "input-observer": { bytes: file.bytes, sha256: file.sha256 } },
    sourceSha256: sourceSha256.digest("hex"),
  }, null, 2) + "\n");
  observerProgram({ nativeDirectory: directory, observer }, { platform: "darwin", arch });
  return directory;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 2 || (args.length && args[0] !== "--arch") || (args.length === 2 && !["arm64", "x64"].includes(args[1]))) throw Error("MAC_INPUT_BUILD_ARGUMENTS");
  console.log("Mac Rust 鼠标监听程序已构建并校验：" + build(args[1] || process.arch));
}
module.exports = { build };
