const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const asar = require("@electron/asar");
const { inspectPe, observerProgram } = require("../desktop/native-program.cjs");
const { APP_ID } = require("../desktop/brand.cjs");
const digest = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function macho(bytes) {
  if (bytes.length < 32) throw Error("MACHO_TRUNCATED");
  const magic = bytes.readUInt32BE(0),
    map = { 0x01000007: "x64", 0x0100000c: "arm64" };
  if (magic === 0xcafebabe || magic === 0xcafebabf) {
    const count = bytes.readUInt32BE(4),
      size = magic === 0xcafebabf ? 32 : 20;
    if (!count || count > 16 || 8 + count * size > bytes.length)
      throw Error("MACHO_FAT_HEADER");
    const architectures = [];
    for (let i = 0; i < count; i++) {
      const o = 8 + i * size,
        cpu = map[bytes.readUInt32BE(o)],
        offset =
          magic === 0xcafebabf
            ? Number(bytes.readBigUInt64BE(o + 8))
            : bytes.readUInt32BE(o + 8),
        length =
          magic === 0xcafebabf
            ? Number(bytes.readBigUInt64BE(o + 16))
            : bytes.readUInt32BE(o + 12);
      if (
        !cpu ||
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 8 + count * size ||
        length < 8 ||
        offset + length > bytes.length
      )
        throw Error("MACHO_FAT_SLICE");
      const inside = macho(bytes.subarray(offset, offset + length));
      if (
        inside.length !== 1 ||
        inside[0] !== cpu ||
        architectures.includes(cpu)
      )
        throw Error("MACHO_FAT_IDENTITY");
      architectures.push(cpu);
    }
    return architectures;
  }
  const little = magic === 0xcffaedfe;
  if (!little && magic !== 0xfeedfacf) throw Error("MACHO_UNSUPPORTED_MAGIC");
  const read = (offset) =>
      little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset),
    arch = map[read(4)];
  if (!arch) throw Error("MACHO_UNSUPPORTED_CPU");
  const count = read(16),
    size = read(20);
  if (count > 65536 || 32 + size > bytes.length)
    throw Error("MACHO_LOAD_COMMANDS");
  let offset = 32;
  for (let i = 0; i < count; i++) {
    if (offset + 8 > 32 + size) throw Error("MACHO_LOAD_COMMANDS");
    const length = read(offset + 4);
    if (length < 8 || offset + length > 32 + size)
      throw Error("MACHO_LOAD_COMMANDS");
    offset += length;
  }
  if (offset !== 32 + size) throw Error("MACHO_LOAD_COMMANDS");
  return [arch];
}
function walk(directory, { links = [] } = {}) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      links.push(file);
      continue;
    }
    if (entry.isDirectory()) files.push(...walk(file, { links }));
    else files.push(file);
  }
  return files;
}
function auditPackage({
  directory,
  platform = process.platform,
  arch = process.arch,
  runtime = "node",
  plist = null,
  sourceRoot = path.resolve(__dirname, ".."),
} = {}) {
  directory = path.resolve(directory);
  if (
    !["win32", "darwin"].includes(platform) ||
    !["x64", "arm64"].includes(arch) ||
    runtime !== "node"
  )
    throw Error("PACKAGE_ARGUMENTS");
  const resources = path.join(
      directory,
      platform === "darwin" ? "Contents/Resources" : "resources",
    ),
    archive = path.join(resources, "app.asar"),
    files = asar.listPackage(archive).map((f) => f.replace(/\\/g, "/"));
  const extract = (name) =>
    asar.extractFile(archive, name.replace(/^\//, "").replace(/\//g, path.sep));
  const forbidden =
    /\/(?:\.runtime|\.snapsolver|\.test-data|\.git|tests|artifacts|scripts|native|build)(?:\/|$)|\/(?:\.env(?:\..*)?|api_keys\.json|api_base_urls\.json|devices\.json|runtime-secret\.json|test-input-driver(?:\.exe)?)$|^\/config\/.*\.local\.json$/;
  assert.deepEqual(
    files.filter((f) => forbidden.test(f) && !f.startsWith("/node_modules/")),
    [],
  );
  for (const name of [
    "electron-builder",
    "@playwright",
    "playwright",
    "app-builder-lib",
    "typescript",
    "vite",
    "react-dom",
    "react-markdown",
    "html2canvas",
    "pdf-lib",
  ])
    assert.equal(
      files.some((f) => f.startsWith("/node_modules/" + name + "/")),
      false,
      "Bundled development dependency: " + name,
    );
  for (const name of [
    "desktop/main.cjs",
    "desktop/native-program.cjs",
    "desktop/mouse-input.cjs",
    "desktop/runtime-paths.cjs",
    "desktop/node-runtime.cjs",
    "desktop/ui/index.html",
    "desktop/silent-audio.cjs",
    "service/main.cjs",
    "service/migrations/schema/001.sql",
    "contracts/validate.cjs",
    "contracts/public.cjs",
    "contracts/http-v1.json",
    "phone-dist/index.html",
    "phone-dist/licenses.md",
    "web/quiet.js",
    "web/brand/icon.svg",
    "web/brand/trayTemplate.png",
    "node_modules/ai/package.json",
    "node_modules/express/package.json",
  ])
    assert.ok(
      files.includes("/" + name),
      "Missing application resource: " + name,
    );
  const html = extract("phone-dist/index.html").toString();
  assert.ok(html.includes('data-snap-runtime="node"'));
  assert.ok(
    html.indexOf("quiet.js") >= 0 &&
      html.indexOf("quiet.js") < html.indexOf('type="module"'),
  );
  for (const match of html.matchAll(/(?:src|href)="\/snap\/phone\/([^"?#]+)/g))
    assert.ok(
      files.includes("/phone-dist/" + match[1]),
      "Missing compiled browser asset",
    );
  const licenses = extract("phone-dist/licenses.md").toString();
  for (const name of ["react", "katex", "cropperjs", "pdf-lib", "html2canvas"])
    assert.ok(licenses.toLowerCase().includes(name));
  const metadata = JSON.parse(extract("package.json"));
  assert.equal(
    metadata.version,
    require(path.join(sourceRoot, "package.json")).version,
  );
  assert.equal(metadata.main, "desktop/main.cjs");
  for (const file of ["LICENSE.txt", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(fs.existsSync(path.join(resources, file)));
    assert.ok(
      fs
        .readFileSync(path.join(resources, file))
        .equals(
          fs.readFileSync(
            path.join(sourceRoot, file === "LICENSE.txt" ? "LICENSE" : file),
          ),
        ),
      "Packaged license differs",
    );
  }
  let runtimeInfo,
    binaries = [];
  {
    assert.equal(metadata.scryletRuntimeDefault, "node");
    assert.ok(["node", "node-candidate"].includes(metadata.scryletBuild?.runtime));
    assert.equal(metadata.scryletBuild?.normalUserDataMigration, true);
    assert.equal(metadata.dependencies?.["http-proxy"], undefined);
    for (const forbidden of ["desktop/legacy-runtime.cjs", "desktop/legacy-gateway.cjs", "desktop/legacy-paths.cjs", "web/extension.js", "web/composer.js", "web/desktop-capture.js", "web/attachments.js", "web/scope.js", "web/mobile.css", "node_modules/http-proxy/index.js"]) assert.equal(files.includes("/" + forbidden), false, "Legacy resource in Node package: " + forbidden);
    assert.equal(fs.existsSync(path.join(resources, "python")), false);
    assert.equal(fs.existsSync(path.join(resources, "runtime")), false);
    assert.equal(
      files.some(
        (f) => /\.(?:py|pyc)$/.test(f) && !f.startsWith("/node_modules/"),
      ),
      false,
    );
    runtimeInfo = { engine: "node", python: false };
  }
  if (platform === "win32") {
    const nativeDirectory = path.join(resources, "native/win32-" + arch),
      observer = path.join(nativeDirectory, "input-observer.exe");
    observerProgram({ nativeDirectory, observer }, { platform, arch });
    assert.equal(
      fs.existsSync(path.join(nativeDirectory, "test-input-driver.exe")),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(nativeDirectory, "test-manifest.json")),
      false,
    );
    assert.ok(fs.existsSync(path.join(nativeDirectory, "NOTICE.txt")));
    assert.ok(
      fs.existsSync(
        path.join(nativeDirectory, "licenses/COPYRIGHT-library.html"),
      ),
    );
    binaries.push({
      file: "native/input-observer.exe",
      ...inspectPe(observer),
    });
    const main = path.join(directory, "Scrylet.exe");
    assert.equal(inspectPe(main).arch, arch);
  } else {
    assert.ok(plist, "Mac audit requires the actual parsed Info.plist");
    assert.equal(metadata.scryletBuild?.platform, "darwin");
    assert.equal(metadata.scryletBuild?.arch, arch);
    assert.equal(metadata.scryletBuild?.mouseObserver, false);
    assert.ok(["node", "node-candidate"].includes(metadata.scryletBuild?.runtime));
    assert.equal(metadata.scryletBuild?.normalUserDataMigration, true);
    assert.equal(plist.CFBundleIdentifier, APP_ID);
    assert.equal(plist.CFBundleExecutable, "Scrylet");
    assert.match(plist.LSMinimumSystemVersion, /^\d+(?:\.\d+){1,2}$/);
    assert.equal(plist.CFBundleShortVersionString, metadata.version);
    const icon = path.join(
      resources,
      plist.CFBundleIconFile.endsWith(".icns")
        ? plist.CFBundleIconFile
        : plist.CFBundleIconFile + ".icns",
    );
    assert.equal(fs.readFileSync(icon).toString("ascii", 0, 4), "icns");
    const links = [];
    for (const file of walk(directory, { links })) {
      if (
        /\.(?:exe|dll|py|pyc)$/.test(file) ||
        /test-input-driver|\.test-data|(?:^|[\\/])(?:\.snapsolver|\.runtime|\.git|api_keys\.json|api_base_urls\.json|devices\.json|runtime-secret\.json|config\.local\.json)(?:$|[\\/])/.test(
          file,
        )
      )
        throw Error("MAC_FOREIGN_RESOURCE");
      const bytes = fs.readFileSync(file),
        magic = bytes.length >= 4 ? bytes.readUInt32BE(0) : 0;
      if ([0xcffaedfe, 0xfeedfacf, 0xcafebabe, 0xcafebabf].includes(magic)) {
        assert.deepEqual(
          macho(bytes),
          [arch],
          "Wrong Mach-O architecture: " + path.relative(directory, file),
        );
        assert.ok(fs.statSync(file).mode & 0o111);
        binaries.push({
          file: path.relative(directory, file),
          arch,
          bytes: bytes.length,
          sha256: digest(file),
        });
      } else if (file.endsWith(".node") || file.endsWith(".dylib"))
        throw Error("MAC_UNRECOGNIZED_NATIVE_BINARY");
    }
    for (const link of links) {
      const real = fs.realpathSync(link);
      assert.ok(
        real.startsWith(directory + path.sep),
        "App symlink leaves bundle",
      );
    }
    assert.ok(
      binaries.some(
        (b) => b.file === path.join("Contents/MacOS", plist.CFBundleExecutable),
      ),
    );
    assert.ok(binaries.some((b) => b.file.includes("Electron Framework")));
    assert.equal(
      fs.existsSync(path.join(resources, "native")),
      false,
      "Mac observer capability=false, no Windows or empty helper tree",
    );
  }
  let matched = 0;
  for (const file of files.filter((f) =>
    /^\/(desktop|service|contracts|web|config|phone-dist)\//.test(f),
  )) {
    let source = file.slice(1);
    if (file.startsWith("/phone-dist/"))
      source = "build/phone/" + file.slice("/phone-dist/".length);
    const from = path.join(sourceRoot, source);
    if (!fs.existsSync(from) || fs.statSync(from).isDirectory()) continue;
    assert.ok(
      extract(file).equals(fs.readFileSync(from)),
      "Packaged source differs: " + file,
    );
    matched++;
  }
  return {
    status: "passed",
    platform,
    arch,
    runtime: runtimeInfo,
    appId: platform === "darwin" ? plist.CFBundleIdentifier : APP_ID,
    minimumSystemVersion: plist?.LSMinimumSystemVersion || null,
    files: files.length,
    matchedProjectFiles: matched,
    noPrivateData: true,
    noDevelopmentDependencies: true,
    binaries,
    archiveSha256: digest(archive),
  };
}
module.exports = { auditPackage, macho, walk, digest };
