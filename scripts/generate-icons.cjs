// static/favicon.ico is the existing source artwork; never overwrite it.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "..");
const directory = path.join(root, "web/brand");

(async () => {
  const ico = fs.readFileSync(path.join(root, "static/favicon.ico"));
  const entries = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
    const at = 6 + index * 16;
    return { size: ico[at] || 256, length: ico.readUInt32LE(at + 8), offset: ico.readUInt32LE(at + 12) };
  }).sort((a, b) => b.size - a.size);
  const largest = entries[0];
  const png = ico.subarray(largest.offset, largest.offset + largest.length);
  if (png.subarray(1, 4).toString() !== "PNG") throw Error("STATIC_ICON_PNG_REQUIRED");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,' + png.toString("base64") + '"/></svg>';
  fs.writeFileSync(path.join(root, "static/logo.png"), png);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const raster = async (source, size) => {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>' + source);
      return page.screenshot({ omitBackground: true });
    };
    if (process.argv.includes("--mac")) {
      console.log(JSON.stringify(await require("./mac-icons.cjs").macIcons(root, svg, raster)));
      return;
    }
    fs.writeFileSync(path.join(root, "packaging/icon.svg"), svg);
    fs.writeFileSync(path.join(directory, "icon.svg"), svg);
    fs.writeFileSync(path.join(root, "packaging/icon.ico"), ico);
    fs.writeFileSync(path.join(root, "app.ico"), ico);
    fs.writeFileSync(path.join(directory, "icon.png"), png);
    fs.writeFileSync(path.join(directory, "apple-touch-icon.png"), await raster(svg, 180));
    await page.setViewportSize({ width: 44, height: 44 });
    await page.setContent('<canvas width="44" height="44"></canvas>');
    const template = await page.evaluate(async data => {
      const image = new Image(); image.src = data; await image.decode();
      const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, 44, 44);
      const pixels = ctx.getImageData(0, 0, 44, 44);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const visible = Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) > 160;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0;
        if (!visible) pixels.data[i + 3] = 0;
      }
      ctx.putImageData(pixels, 0, 0); return canvas.toDataURL().split(',')[1];
    }, 'data:image/png;base64,' + png.toString('base64'));
    fs.writeFileSync(path.join(directory, "trayTemplate.png"), Buffer.from(template, 'base64'));
    console.log("已从 static/favicon.ico 同步桌面、手机、Windows 与托盘图标，原始 static 图标保持不变。");
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
