const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { packageConfig } = require("../scripts/package-config.cjs");
const { macho } = require("../scripts/package-audit.cjs");
const { runtimePaths } = require("../desktop/runtime-paths.cjs");
const { observerProgram, inspectPe } = require("../desktop/native-program.cjs");
const dist = require("../scripts/dist-mac.cjs"),
  smoke = require("../scripts/smoke-mac-package.cjs");
test("per-platform packaging removes legacy runtime and ships only the precompiled observer", () => {
  const win = packageConfig({ platform: "win32", arch: "x64" });
  assert.equal(win.appId, "com.snapsolver.desktop");
  assert.equal(win.nsis.deleteAppDataOnUninstall, false);
  assert.ok(!win.extraResources.some((f) => /python|runtime/.test(f.to)));
  const native = win.extraResources.find((f) => f.to === "native/win32-x64");
  assert.deepEqual(native.filter, [
    "input-observer.exe",
    "manifest.json",
    "NOTICE.txt",
    "licenses/**/*",
  ]);
  assert.ok(!native.filter.some((f) => f.includes("test-input")));
  assert.throws(() => packageConfig({ platform: "win32", arch: "arm64" }));
});
for (const arch of ["x64", "arm64"])
  test(
    "Mac " +
      arch +
      " config has DMG/ZIP, ICNS, no Windows/Python/helper resources, default Node userData migration",
    () => {
      const mac = packageConfig({ platform: "darwin", arch });
      assert.deepEqual(mac.mac.target, ["dmg", "zip"]);
      assert.equal(mac.mac.icon, "packaging/icon.icns");
      assert.equal(mac.dmg.contents[1].path, "/Applications");
      assert.equal(mac.dmg.format, "UDZO");
      assert.ok(
        !mac.extraResources.some((f) =>
          /python|runtime|native|\.exe/.test(f.from + f.to),
        ),
      );
      assert.equal(mac.extraMetadata.scryletBuild.arch, arch);
      assert.equal(mac.extraMetadata.scryletBuild.mouseObserver, false);
      assert.equal(mac.extraMetadata.scryletBuild.normalUserDataMigration, true);
      assert.equal(Object.hasOwn(mac.mac, "identity"), false);
      const paths = runtimePaths({
        root: "/Applications/Scrylet.app/Contents/Resources/app.asar",
        resourcesPath: "/Applications/Scrylet.app/Contents/Resources",
        platform: "darwin",
        arch,
        pythonOverride: "",
      });
      assert.equal(paths.packaged, true);
      assert.equal(paths.observer, null);
      assert.equal(observerProgram(paths, { platform: "darwin", arch }), null);
    },
  );
test("Mac wrappers reject unsupported arch/profile and non-Mac before creating success evidence", () => {
  assert.throws(() => dist.parse(["--arch", "universal"]));
  assert.throws(() => dist.parse(["--profile", "unsigned-auto-release"]));
  assert.throws(() => smoke.parse(["--arch", "x64"]));
  if (process.platform !== "darwin") {
    assert.throws(() => dist.main(["--arch", "arm64"]), /真实 macOS/);
  }
});
function thin(arch) {
  const bytes = Buffer.alloc(32);
  bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeUInt32LE(arch === "arm64" ? 0x100000c : 0x1000007, 4);
  bytes.writeUInt32LE(2, 12);
  return bytes;
}
test("Mach-O architecture audit validates thin/fat CPU identity, bounds and load commands", () => {
  assert.deepEqual(macho(thin("arm64")), ["arm64"]);
  assert.deepEqual(macho(thin("x64")), ["x64"]);
  for (const bytes of [
    Buffer.alloc(8),
    Buffer.from("MZ"),
    (() => {
      const b = thin("x64");
      b.writeUInt32LE(1, 16);
      b.writeUInt32LE(20, 20);
      return b;
    })(),
  ])
    assert.throws(() => macho(bytes));
  const fat = Buffer.alloc(112);
  fat.writeUInt32BE(0xcafebabe);
  fat.writeUInt32BE(2, 4);
  for (const [i, arch] of [
    [0, "x64"],
    [1, "arm64"],
  ]) {
    const o = 8 + i * 20;
    fat.writeUInt32BE(arch === "x64" ? 0x1000007 : 0x100000c, o);
    fat.writeUInt32BE(48 + i * 32, o + 8);
    fat.writeUInt32BE(32, o + 12);
    thin(arch).copy(fat, 48 + i * 32);
  }
  assert.deepEqual(macho(fat), ["x64", "arm64"]);
  fat.writeUInt32BE(999999, 16);
  assert.throws(() => macho(fat));
});
test("generated ICNS contains native rasterized SVG sizes and Retina PNG entries", () => {
  const bytes = fs.readFileSync(
    path.resolve(__dirname, "../packaging/icon.icns"),
  );
  assert.equal(bytes.toString("ascii", 0, 4), "icns");
  assert.equal(bytes.readUInt32BE(4), bytes.length);
  const sizes = {
    icp4: 16,
    icp5: 32,
    icp6: 64,
    ic07: 128,
    ic08: 256,
    ic09: 512,
    ic10: 1024,
    ic11: 32,
    ic12: 64,
    ic13: 256,
    ic14: 512,
  };
  const seen = [];
  for (let o = 8; o < bytes.length; ) {
    const type = bytes.toString("ascii", o, o + 4),
      length = bytes.readUInt32BE(o + 4);
    assert.ok(sizes[type] && length > 32 && o + length <= bytes.length);
    const png = bytes.subarray(o + 8, o + length);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), sizes[type]);
    assert.equal(png.readUInt32BE(20), sizes[type]);
    seen.push(type);
    o += length;
  }
  assert.deepEqual(seen.sort(), Object.keys(sizes).sort());
});
test("native executable hash / architecture mismatch fails closed; no Python fallback path", (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "scrylet-native-unit-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "input-observer.exe"),
    bytes = Buffer.alloc(256);
  bytes.write("MZ");
  bytes.writeUInt32LE(128, 60);
  bytes.writeUInt32LE(0x4550, 128);
  bytes.writeUInt16LE(0x8664, 132);
  fs.writeFileSync(file, bytes);
  const m = {
    schemaVersion: 1,
    protocolVersion: 1,
    platform: "win32",
    arch: "x64",
    coordinateSpace: "physical",
    globalMouse: true,
    files: { "input-observer.exe": inspectPe(file) },
  };
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(m));
  assert.equal(
    observerProgram(
      { observer: file, nativeDirectory: directory },
      { platform: "win32", arch: "x64" },
    ),
    file,
  );
  bytes[255] = 1;
  fs.writeFileSync(file, bytes);
  assert.throws(() =>
    observerProgram(
      { observer: file, nativeDirectory: directory },
      { platform: "win32", arch: "x64" },
    ),
  );
});
