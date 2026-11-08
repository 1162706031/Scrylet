const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const directory = path.resolve("tests/fixtures/legacy-v1");
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name + ".json"), "utf8"));
test("frozen pinned schema keeps JSON + normalized graph, source units, prompts and deleted keys", () => {
  const s = read("database");
  assert.equal(s.upstream, "0.12.2");
  for (const name of ["chat", "chat_message", "chat_file", "file", "config", "model", "prompt"]) assert.ok(s.tables[name].columns.length);
  assert.deepEqual(s.tables.config.columns.map(c => c.name), ["key", "value", "updated_at"]);
  assert.ok(s.tables.config.rows.find(r => r.key === "openai.api_keys").value.every(v => v === ""));
  const custom = s.tables.chat.rows.find(r => r.chat.migrationProbe);
  assert.ok(custom);
  assert.notEqual(custom.current_message_id, custom.chat.history.currentId);
  const graph = custom.chat.history.messages;
  assert.equal(Object.keys(graph).length, 5);
  assert.ok(graph[custom.current_message_id]); assert.ok(graph[custom.chat.history.currentId]);
  assert.equal(s.tables.chat_message.rows.filter(r => r.chat_id === custom.id).length, 5);
  for (const name of ["chat", "chat_message", "file", "model", "prompt"]) for (const row of s.tables[name].rows) {
    assert.ok(row.created_at > 1e9 && row.created_at < 1e10, `${name}: source seconds`);
  }
  assert.ok(custom.chat.timestamp > 1e12, "embedded chat timestamp uses milliseconds");
  assert.ok(s.tables.prompt.rows.some(p => p.content === "M0.4 用户修改的提示词，不得被种子覆盖"));
  assert.equal(s.tables.model.rows.length, 16);
});
test("frozen browser draft + image byte references remain independent from receiver and credentials", () => {
  const s = read("database"), b = read("browser"), d = read("desktop");
  assert.equal(b.drafts.length, 2);
  assert.equal(b.drafts[0].key, "chat-input");
  assert.match(b.drafts[1].key, /^chat-input-/);
  assert.deepEqual(b.databases, []);
  for (const draft of b.drafts) {
    assert.ok(draft.value.prompt.length);
    for (const file of draft.value.files) {
      assert.equal(file.type, "file"); assert.equal(file.status, "uploaded"); assert.equal(file.url, file.id);
      const bytes = s.attachments.find(a => a.fileId === file.id); assert.ok(bytes);
      const decoded = Buffer.from(bytes.base64, "base64");
      assert.equal(decoded.length, file.size);
      assert.equal(crypto.createHash("sha256").update(decoded).digest("hex"), bytes.sha256);
      assert.equal(s.tables.file.rows.find(r => r.id === file.id).meta.file_hash, bytes.sha256);
    }
  }
  assert.equal(b.preferences["snap.readAloud"], "true");
  assert.equal(b.preferences["snap.speechVoice"], "fixture:zh");
  assert.ok(Number(b.preferences["snap.speechRate"]) >= 0.8);
  const crop = JSON.parse(Object.entries(b.preferences).find(([key]) => key.startsWith("snap.crop."))[1]);
  assert.deepEqual(Object.keys(crop).sort(), ["data", "height", "width"]);
  assert.ok(crop.data.width > 0 && crop.width > 0);
  assert.ok(d.deviceFields.includes("tokenHash"));
  assert.ok(d.devices.length > 0 && !Object.hasOwn(d.devices[0], "tokenHash"));
  assert.ok(Object.hasOwn(d.network, "selectedNetwork"));
});
test("frozen SQL schema and rows can be reconstructed using Electron SQLite without Python", () => {
  const result = spawnSync(require("electron"), [path.resolve("tests/legacy-freeze/replay.cjs"), directory], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout); assert.equal(report.tables, 7); assert.equal(report.normalizedMessages, 10);
});
