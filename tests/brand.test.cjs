const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { NAME, APP_ID, dataDirectory } = require("../desktop/brand.cjs");

test("新安装使用 Scrylet，安装身份仍可识别旧版", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-brand-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.equal(NAME, "Scrylet");
  assert.equal(APP_ID, "com.snapsolver.desktop");
  assert.equal(dataDirectory(directory), path.join(directory, "Scrylet"));
  assert.deepEqual(fs.readdirSync(directory), []);
});

test("已有旧目录时沿用原数据，不复制、移动或重写", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-legacy-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const legacy = path.join(directory, "Snap-Solver");
  fs.mkdirSync(legacy);
  const sentinel = path.join(legacy, "keep.txt");
  fs.writeFileSync(sentinel, "preserve settings and chats");
  assert.equal(dataDirectory(directory), legacy);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "preserve settings and chats");
  assert.equal(fs.existsSync(path.join(directory, NAME)), false);
});

test("显式隔离目录优先于旧安装，普通文件不能作为旧目录", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-override-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "Snap-Solver"), "file");
  assert.equal(dataDirectory(directory), path.join(directory, NAME));
  assert.equal(dataDirectory(directory, "isolated-data"), path.resolve("isolated-data"));
});
