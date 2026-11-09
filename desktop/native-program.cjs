const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
function inspectPe(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 256 || bytes.toString("ascii", 0, 2) !== "MZ")
    throw Error("NATIVE_INVALID_PE");
  const offset = bytes.readUInt32LE(60);
  if (offset + 26 > bytes.length || bytes.readUInt32LE(offset) !== 0x4550)
    throw Error("NATIVE_INVALID_PE");
  const arch = { 0x8664: "x64", 0xaa64: "arm64", 0x14c: "ia32" }[
    bytes.readUInt16LE(offset + 4)
  ];
  if (!arch) throw Error("NATIVE_UNSUPPORTED_ARCH");
  return {
    arch,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}
function inspectMachO(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 32 || bytes.readUInt32LE(0) !== 0xfeedfacf) throw Error("NATIVE_INVALID_MACHO");
  const arch = { 0x100000c: "arm64", 0x1000007: "x64" }[bytes.readUInt32LE(4)];
  if (!arch) throw Error("NATIVE_UNSUPPORTED_ARCH");
  return { arch, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}
function observerProgram(
  paths,
  { platform = process.platform, arch = process.arch } = {},
) {
  if (!paths.observer || !((platform === "win32" && arch === "x64") ||
    (platform === "darwin" && ["arm64", "x64"].includes(arch)))) return null;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(paths.nativeDirectory, "manifest.json"), "utf8"),
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.protocolVersion !== 1 ||
    manifest.platform !== platform ||
    manifest.arch !== arch ||
    manifest.coordinateSpace !== (platform === "darwin" ? "dip" : "physical") ||
    manifest.globalMouse !== true ||
    !manifest.files ||
    Object.keys(manifest.files).join(",") !== (platform === "darwin" ? "input-observer" : "input-observer.exe")
  )
    throw Error("NATIVE_INVALID_MANIFEST");
  const actual = platform === "darwin" ? inspectMachO(paths.observer) : inspectPe(paths.observer),
    expected = manifest.files[platform === "darwin" ? "input-observer" : "input-observer.exe"];
  if (
    actual.arch !== arch ||
    actual.bytes !== expected.bytes ||
    actual.sha256 !== expected.sha256
  )
    throw Error("NATIVE_HASH_OR_ARCH_MISMATCH");
  return paths.observer;
}
module.exports = { inspectPe, inspectMachO, observerProgram };
