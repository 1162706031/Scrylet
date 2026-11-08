const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { NodeRuntime } = require("../../desktop/node-runtime.cjs");
const { Storage } = require("../../service/storage.cjs");
module.exports = async function bootstrapChecks(directory) {
  const legacy = path.join(directory, "legacy"), target = path.join(directory, "node"); fs.mkdirSync(legacy, { recursive: true });
  const selected = require("../../config/providers.json").providers.find(p => p.id === "alibaba");
  const prompts = path.join(legacy, "prompts.json"), keys = path.join(legacy, "api_keys.json");
  fs.writeFileSync(prompts, JSON.stringify({ custom: { name: "旧自定义", content: "保留旧提示词" }, "中文 键": { name: "中文提示词", content: "保留中文键" } }));
  fs.writeFileSync(keys, JSON.stringify({ [selected.legacyKey]: "synthetic-bootstrap-only" }));
  const before = fs.readFileSync(prompts); let runtime;
  const start = async () => { runtime = new NodeRuntime(target, { bootstrapSources: true, legacyDirectory: legacy }); await runtime.start(); };
  const request = async (route, body) => {
    const response = await fetch(runtime.url + "/snap/api" + route, { method: body ? "PATCH" : "GET", headers: { authorization: "Bearer " + runtime.credential, "x-scrylet-device": "bootstrap-fixture", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.ok, true); return response.json();
  };
  try {
    await start(); const initial = await request("/prompts"); assert.equal(initial.length, 2);
    const custom = initial.find(p => p.command === "/snap-custom"), other = initial.find(p => p.id !== custom.id);
    assert.equal(custom.content, "保留旧提示词"); assert.ok(/^[A-Za-z0-9_-]+$/.test(other.id)); assert.ok(fs.readFileSync(prompts).equals(before));
    assert.equal((await runtime.providers()).providers.find(p => p.id === "alibaba").configured, true);
    await request("/prompts/" + custom.id, { apiVersion: 1, ...custom, updatedAt: undefined, expectedUpdatedAt: custom.updatedAt, content: "用户后续保存" });
    const current = (await runtime.providers()).providers.find(p => p.id === "alibaba");
    await runtime.saveProvider("alibaba", { apiVersion: 1, providerId: "alibaba", revision: current.revision, baseUrl: current.baseUrl, apiType: current.apiType, modelIds: current.models, keyAction: "delete" });
    await runtime.stop(); const storage = new Storage(target); try { storage.db.prepare("DELETE FROM prompts WHERE id=?").run(other.id); } finally { storage.close(); }
    fs.writeFileSync(prompts, JSON.stringify({ custom: { name: "冲突种子", content: "不可重新覆盖" } }));
    await start(); const reopened = await request("/prompts"); assert.equal(reopened.length, 1); assert.equal(reopened[0].content, "用户后续保存");
    assert.equal((await runtime.providers()).providers.find(p => p.id === "alibaba").configured, false);
    return ["first-use-legacy-prompt-file-and-OS-key-import-before-ready", "repeat-start-keeps-prompt-edits-deletions-and-key-tombstones"];
  } finally { await runtime?.stop(); }
};
