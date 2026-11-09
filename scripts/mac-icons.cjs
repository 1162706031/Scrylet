const fs = require("node:fs"),
  path = require("node:path");
const { spawnSync } = require("node:child_process");
async function macIcons(root, svg, raster) {
  const directory = path.join(root, "build/icons/Scrylet.iconset");
  fs.mkdirSync(directory, { recursive: true });
  const images = new Map();
  for (const size of [16, 32, 64, 128, 256, 512, 1024])
    images.set(size, await raster(svg, size));
  for (const size of [16, 32, 128, 256, 512]) {
    fs.writeFileSync(
      path.join(directory, `icon_${size}x${size}.png`),
      images.get(size),
    );
    fs.writeFileSync(
      path.join(directory, `icon_${size}x${size}@2x.png`),
      images.get(size * 2),
    );
  }
  const target = path.join(root, "packaging/icon.icns");
  if (process.platform === "darwin") {
    const result = spawnSync(
      "/usr/bin/iconutil",
      ["--convert", "icns", "--output", target, directory],
      { stdio: "inherit" },
    );
    if (result.status !== 0) throw Error("MAC_ICONUTIL_FAILED");
  } else {
    // ICNS PNG containers can be prepared and structurally verified off Mac.
    // dist-mac regenerates with native iconutil; this is no Mac rendering claim.
    const chunks = [];
    for (const [type, size] of [
      ["icp4", 16],
      ["icp5", 32],
      ["icp6", 64],
      ["ic07", 128],
      ["ic08", 256],
      ["ic09", 512],
      ["ic10", 1024],
      ["ic11", 32],
      ["ic12", 64],
      ["ic13", 256],
      ["ic14", 512],
    ]) {
      const png = images.get(size),
        header = Buffer.alloc(8);
      header.write(type);
      header.writeUInt32BE(png.length + 8, 4);
      chunks.push(header, png);
    }
    const header = Buffer.alloc(8);
    header.write("icns");
    header.writeUInt32BE(
      chunks.reduce((n, b) => n + b.length, 8),
      4,
    );
    fs.writeFileSync(target, Buffer.concat([header, ...chunks]));
  }
  return {
    file: target,
    nativeIconutil: process.platform === "darwin",
    source: "static/favicon.ico",
    sizes: [...images.keys()],
  };
}
module.exports = { macIcons };
