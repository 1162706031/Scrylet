const fs = require("node:fs"),
  path = require("node:path");
const { spawnSync } = require("node:child_process");
const { packageConfig } = require("./package-config.cjs");
const { run: audit } = require("./audit-package.cjs");
const { digest } = require("./package-audit.cjs");
const root = path.resolve(__dirname, ".."),
  metadata = require("../package.json");
function parse(argv) {
  const options = { arch: process.arch, profile: "development" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--archive-only") { options.archiveOnly = true; continue; }
    if (argv[i] === "--prebuilt-phone") { options.prebuiltPhone = true; continue; }
    const key = { "--arch": "arch", "--profile": "profile" }[argv[i]];
    if (!key || !argv[i + 1]) throw Error("MAC_BUILD_ARGUMENTS");
    options[key] = argv[++i];
  }
  if (
    !["arm64", "x64"].includes(options.arch) ||
    !["development", "distribution"].includes(options.profile)
  )
    throw Error("MAC_BUILD_ARGUMENTS");
  if (options.profile === "distribution" && (options.archiveOnly || options.prebuiltPhone))
    throw Error("MAC_DISTRIBUTION_REQUIRES_NATIVE_BUILD");
  return options;
}
function command(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error || result.status !== 0)
    throw Error("MAC_BUILD_STEP_FAILED: " + path.basename(file));
  return result;
}
function signing(app) {
  const result = spawnSync(
    "/usr/bin/codesign",
    ["--display", "--verbose=4", app],
    { encoding: "utf8" },
  );
  const text = result.stderr || "";
  return {
    state:
      result.status !== 0
        ? "unsigned"
        : /Signature=adhoc/.test(text)
          ? "ad-hoc"
          : /Authority=Developer ID Application:/.test(text)
            ? "developer-id"
            : "other-signed",
    verified:
      spawnSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], {
        stdio: "ignore",
      }).status === 0,
  };
}
function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (process.platform !== "darwin" && !(process.platform === "linux" && options.archiveOnly))
    throw Error("DMG / 签名需要真实 macOS；Linux 可显式 --archive-only 生成未验证 ZIP");
  if (
    options.profile === "distribution" &&
    metadata.scryletRuntimeDefault !== "node"
  )
    throw Error(
      "M4 迁移 / 新数据回退和 M5 默认切换尚未验收；只能构建显式隔离的 development 候选包",
    );
  const stage = path.join(
    root,
    "build/mac-" + options.arch + "-" + options.profile + (options.archiveOnly ? "-zip" : ""),
  );
  fs.mkdirSync(stage, { recursive: true });
  const report = {
    status: "running",
    platform: "darwin",
    buildHost: process.platform,
    targets: options.archiveOnly ? ["zip"] : ["dmg", "zip"],
    hostArch: process.arch,
    targetArch: options.arch,
    version: metadata.version,
    profile: options.profile,
    installation: "unverified",
    nativeMouseObserver: true,
  };
  try {
    if (!options.prebuiltPhone) {
    command(process.execPath, [
      path.join(root, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "-p",
      "phone/tsconfig.json",
    ]);
    command(process.execPath, [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "build",
      "--config",
      "phone/vite.config.mts",
    ]);
    } else {
      for (const name of ["index.html", "licenses.md"])
        if (!fs.existsSync(path.join(root, "build/phone", name))) throw Error("MAC_PREBUILT_PHONE_MISSING");
    }
    const icon = path.join(root, "packaging/icon.icns");
    if (!fs.existsSync(icon) || fs.statSync(icon).size === 0) {
      if (process.platform !== "darwin") throw Error("MAC_ICON_MISSING");
      command(process.execPath, [path.join(root, "scripts/generate-icons.cjs"), "--mac"]);
    }
    if (process.platform === "darwin") command(process.execPath, [path.join(root, "scripts/build-mac-input.cjs"), "--arch", options.arch]);
    else {
      const prebuilt = path.join(root, "build/native/darwin-" + options.arch);
      require("../desktop/native-program.cjs").observerProgram({ nativeDirectory: prebuilt, observer: path.join(prebuilt, "input-observer") }, { platform: "darwin", arch: options.arch });
    }
    const config = packageConfig({ platform: "darwin", ...options });
    if (process.platform === "darwin" && options.arch === process.arch) {
      command(process.execPath, [path.join(root, "node_modules/electron/install.js")]);
      const electronDist = path.join(root, "node_modules/electron/dist");
      const installedVersion = fs.readFileSync(path.join(electronDist, "version"), "utf8").trim();
      if (installedVersion !== require("../node_modules/electron/package.json").version)
        throw Error("MAC_ELECTRON_VERSION_MISMATCH");
      config.electronDist = electronDist;
    }
    config.directories.app = require("./node-package-stage.cjs").stageNodePackage(root, stage);
    config.files = config.files.map(file => typeof file === "object" && file.to === "phone-dist" ? { from: "phone-dist", to: "phone-dist", filter: ["**/*"] } : file);
    config.directories.output = path.join(stage, "output");
    if (options.profile === "distribution") config.mac.notarize = true;
    if (options.archiveOnly) config.mac.target = ["zip"];
    const file = path.join(stage, "builder.json");
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
    command(
      process.execPath,
      [
        process.env.SCRYLET_BUILDER_CLI || path.join(root, "node_modules/electron-builder/cli.js"),
        "--projectDir",
        root,
        "--config",
        file,
        "--mac",
        ...(options.archiveOnly ? ["zip"] : ["dmg", "zip"]),
        "--" + options.arch,
        "--publish",
        "never",
      ],
      {
        env: {
          ...process.env,
          ...(options.profile === "development"
            ? { CSC_IDENTITY_AUTO_DISCOVERY: "false" }
            : {}),
        },
      },
    );
    const app = path.join(
      config.directories.output,
      options.arch === "arm64" ? "mac-arm64" : "mac",
      "Scrylet.app",
    );
    report.audit = audit([
      app,
      "--platform",
      "darwin",
      "--arch",
      options.arch,
      "--runtime",
      "node",
      ...(process.platform !== "darwin" ? ["--structural-only"] : []),
    ]);
    report.signing = process.platform === "darwin" ? signing(app) : { state: "unverified", verified: false };
    if (
      options.profile === "distribution" &&
      (report.signing.state !== "developer-id" ||
        !report.signing.verified ||
        spawnSync("/usr/bin/xcrun", ["stapler", "validate", app], {
          stdio: "ignore",
        }).status !== 0)
    )
      throw Error("MAC_DISTRIBUTION_SIGNATURE_OR_NOTARIZATION_UNVERIFIED");
    report.artifacts = [];
    const deliver = path.join(root, "dist/releases", metadata.version);
    fs.mkdirSync(deliver, { recursive: true });
    for (const extension of report.targets) {
      const name = `Scrylet-${metadata.version}-mac-${options.arch}.${extension}`,
        from = path.join(config.directories.output, name);
      if (!fs.existsSync(from) || fs.statSync(from).size === 0)
        throw Error("MAC_INSTALLER_MISSING");
      const target = path.join(deliver, name);
      fs.copyFileSync(from, target);
      const sha256 = digest(target);
      fs.writeFileSync(target + ".sha256", sha256 + "  " + name + "\n");
      report.artifacts.push({
        file: path.relative(root, target),
        bytes: fs.statSync(target).size,
        sha256,
      });
    }
    report.status = "built-not-installed";
    report.actualPackageRunArch = "unverified";
    report.app = path.relative(root, app);
  } catch (error) {
    report.status = "failed";
    report.code = error.message;
    throw error;
  } finally {
    fs.writeFileSync(
      path.join(stage, "package-check.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  }
  return report;
}
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { main, parse, signing };
