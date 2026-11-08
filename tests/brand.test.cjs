const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { NAME, APP_ID, dataDirectory, migrationSource } = require("../desktop/brand.cjs");

test("新安装使用 Scrylet，安装身份仍可识别旧版", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-brand-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.equal(NAME, "Scrylet");
  assert.equal(APP_ID, "com.snapsolver.desktop");
  assert.equal(dataDirectory(directory), path.join(directory, "Scrylet"));
  assert.deepEqual(fs.readdirSync(directory), []);
});

test("Node 使用独立新目录并发现旧库；拒绝旧引擎写入旧目录", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-legacy-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const legacy = path.join(directory, "Snap-Solver");
  fs.mkdirSync(path.join(legacy, "open-webui"), { recursive: true });
  const sentinel = path.join(legacy, "keep.txt");
  fs.writeFileSync(sentinel, "preserve settings and chats");
  fs.writeFileSync(path.join(legacy, "open-webui/webui.db"), "synthetic fixture");
  assert.equal(dataDirectory(directory), path.join(directory, NAME));
  assert.throws(() => dataDirectory(directory, undefined, "legacy"), /仅支持 Node/);
  assert.equal(migrationSource(directory), legacy);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "preserve settings and chats");
  assert.equal(fs.existsSync(path.join(directory, NAME)), false);
});

test("已完成迁移不重复导入；隔离目录不会自动读取真实旧库", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-migrated-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const legacy = path.join(directory, "Snap-Solver");
  fs.mkdirSync(path.join(legacy, "open-webui"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "open-webui/webui.db"), "synthetic fixture");
  const target = path.join(directory, NAME);
  fs.mkdirSync(path.join(target, "chat-node/v1"), { recursive: true });
  fs.writeFileSync(path.join(target, "chat-node/v1/migration.json"), "{}");
  assert.equal(migrationSource(directory), null);
  const isolated = path.join(directory, "isolated");
  assert.equal(migrationSource(directory, isolated), null);
  assert.equal(migrationSource(directory, isolated, legacy), legacy);
});

test("显式隔离目录优先于旧安装，普通文件不能作为旧目录", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-override-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "Snap-Solver"), "file");
  assert.equal(dataDirectory(directory), path.join(directory, NAME));
  assert.equal(dataDirectory(directory, "isolated-data"), path.resolve("isolated-data"));
});
