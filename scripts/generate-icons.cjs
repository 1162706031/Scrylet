// Rasterize the SVG source at native icon sizes. No image service is needed.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "..");
const directory = path.join(root, "web/brand");

(async () => {
  const svg = fs.readFileSync(path.join(directory, "icon.svg"), "utf8");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const raster = async (source, size) => {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>' + source);
      return page.screenshot({ omitBackground: true });
    };
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const images = [];
    for (const size of sizes) images.push(await raster(svg, size));
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, index) => {
      const start = 6 + index * 16;
      header[start] = header[start + 1] = size === 256 ? 0 : size;
      header.writeUInt16LE(1, start + 4);
      header.writeUInt16LE(32, start + 6);
      header.writeUInt32LE(images[index].length, start + 8);
      header.writeUInt32LE(offset, start + 12);
      offset += images[index].length;
    });
    const ico = Buffer.concat([header, ...images]);
    fs.writeFileSync(path.join(root, "packaging/icon.svg"), svg);
    fs.writeFileSync(path.join(root, "packaging/icon.ico"), ico);
    fs.writeFileSync(path.join(root, "app.ico"), ico);
    fs.writeFileSync(path.join(root, "static/favicon.ico"), ico);
    fs.writeFileSync(path.join(root, "static/favicon.png"), images[2]);
    fs.writeFileSync(path.join(directory, "icon.png"), images.at(-1));
    fs.writeFileSync(path.join(directory, "apple-touch-icon.png"), await raster(svg, 180));
    const template = svg.replace(/<defs>[\s\S]*?<\/defs>/, "").replace(/<rect[^>]*\/>/, "").replaceAll('stroke="#fff"', 'stroke="#000"').replaceAll('fill="#95f1d3"', 'fill="#000"');
    fs.writeFileSync(path.join(directory, "trayTemplate.png"), await raster(template, 44));
    console.log("Scrylet SVG、7 档 Windows 图标、桌面 PNG 与手机图标已生成。");
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
