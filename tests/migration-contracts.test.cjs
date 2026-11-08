const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { migrationContract } = require("../contracts/migration.cjs");
const hash = "a".repeat(64),
  counts = {
    chats: 2,
    messages: 10,
    files: 2,
    prompts: 7,
    connections: 6,
    conflicts: 0,
  };
test("atomic directory publication tolerates bounded Windows sharing violations without overwriting data", async t => {
  const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-publish-")); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const pending = path.join(directory, "pending"), final = path.join(directory, "final"); fs.mkdirSync(pending); fs.writeFileSync(path.join(pending, "data"), "preserve");
  let attempts = 0;
  await require("../service/migrations/common.cjs").publishDirectory(pending, final, { platform: "win32", wait: async () => {}, rename: (from, to) => { if (++attempts <= 2) throw Object.assign(Error("synthetic sharing violation"), { code: "EPERM" }); fs.renameSync(from, to); } });
  assert.equal(attempts, 3); assert.equal(fs.readFileSync(path.join(final, "data"), "utf8"), "preserve");
  fs.mkdirSync(pending); fs.writeFileSync(path.join(pending, "other"), "new");
  await assert.rejects(require("../service/migrations/common.cjs").publishDirectory(pending, final), { code: "VERSION_CONFLICT" });
  assert.equal(fs.readFileSync(path.join(final, "data"), "utf8"), "preserve"); assert.ok(fs.existsSync(path.join(pending, "other")));
});
test("permanent publication failures remain bounded and retain the validated pending copy", async t => {
  const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-publish-fail-")); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const pending = path.join(directory, "pending"), final = path.join(directory, "final"); fs.mkdirSync(pending); fs.writeFileSync(path.join(pending, "data"), "preserve");
  let attempts = 0; await assert.rejects(require("../service/migrations/common.cjs").publishDirectory(pending, final, { platform: "win32", wait: async () => {}, rename: () => { attempts++; throw Object.assign(Error("synthetic locked directory"), { code: "EPERM" }); } }), { code: "EPERM" });
  assert.equal(attempts, 7); assert.equal(fs.existsSync(final), false); assert.equal(fs.readFileSync(path.join(pending, "data"), "utf8"), "preserve");
});
test("migration local state fixes versions, stages, hashes and sanitized counts", () => {
  const state = {
    schemaVersion: 1,
    runId: hash,
    sourceIdentity: hash,
    stage: "snapshotted",
    snapshotHash: hash,
    counts,
  };
  assert.deepEqual(migrationContract("state", state), state);
  for (const change of [
    { stage: "complete-anyway" },
    { schemaVersion: 2 },
    { snapshotHash: "raw-key" },
    { counts: { ...counts, messages: -1 } },
    { apiKey: "never-report" },
  ])
    assert.throws(() => migrationContract("state", { ...state, ...change }), {
      code: "MIGRATION_FAILED",
    });
});
test("activation / rollback reports reject secrets, row payloads and unvalidated status", () => {
  const activation = {
    schemaVersion: 1,
    sourceIdentity: hash,
    snapshotHash: hash,
    status: "validated",
    counts,
  };
  migrationContract("activation", activation);
  for (const status of ["activated", "already-activated", "rollback-validated"])
    migrationContract("report", { ...activation, status });
  for (const data of [
    { ...activation, status: "running" },
    { ...activation, credentials: {} },
    { ...activation, counts: { ...counts, chatRows: [] } },
  ])
    assert.throws(() => migrationContract("activation", data));
});
function graphSource() {
  const fixture = require("./fixtures/legacy-v1/database.json"),
    bytes = fixture.attachments.map((f) => ({
      id: f.fileId,
      sourceId: f.fileId,
      bytes: Buffer.from(f.base64, "base64"),
      sha256: f.sha256,
    }));
  return {
    source: {
      tables: structuredClone(
        Object.fromEntries(
          Object.entries(fixture.tables).map(([n, t]) => [n, t.rows]),
        ),
      ),
    },
    files: bytes,
  };
}
test("legacy graph adapter combines normalized / embedded nodes and top pointer without flattening", () => {
  const { source, files } = graphSource(),
    result = require("../service/migrations/graph.cjs").mapChatsAndBranches(
      source,
      files,
    );
  assert.equal(result.plans.length, 2);
  assert.equal(result.conflicts, 0);
  for (const p of result.plans) {
    assert.equal(p.chat.messages.length, 5);
    assert.equal(p.chat.currentMessageId, p.raw.current_message_id);
    assert.ok(
      p.chat.messages.filter((m) => m.parentMessageId === null).length > 1,
    );
  }
});
test("graph conflicts keep the entire alternate embedded graph; incomplete outputs remain stopped", () => {
  const { source, files } = graphSource(),
    row = source.tables.chat_message.find((m) => m.role === "assistant");
  row.content = "normalized version";
  row.output = [{ type: "message", status: "incomplete" }];
  const result = require("../service/migrations/graph.cjs").mapChatsAndBranches(
    source,
    files,
  );
  assert.equal(result.conflicts, 1);
  assert.equal(
    result.plans.reduce((n, p) => n + p.chat.messages.length, 0),
    15,
  );
  assert.ok(
    result.plans
      .flatMap((p) => p.chat.messages)
      .some((m) => m.status === "stopped"),
  );
});
test("external / expired blob image references are never fetched or discarded", () => {
  for (const url of [
    "https://example.invalid/private.png",
    "blob:http://old.invalid/dead",
  ]) {
    const { source, files } = graphSource(),
      chat = source.tables.chat[0];
    chat.chat.history.messages[
      Object.keys(chat.chat.history.messages)[0]
    ].files = [{ type: "file", url }];
    assert.throws(
      () =>
        require("../service/migrations/graph.cjs").mapChatsAndBranches(
          source,
          files,
        ),
      { code: "MIGRATION_FAILED" },
    );
  }
});
test("schema descriptor is the frozen pinned schema, not a production fixture dependency", () => {
  const descriptor = require("../service/migrations/legacy-schema.json"),
    fixture = require("./fixtures/legacy-v1/database.json");
  assert.equal(descriptor.alembic, fixture.alembic[0].version_num);
  for (const [name, table] of Object.entries(fixture.tables))
    assert.deepEqual(
      descriptor.tables[name].columns,
      table.columns.map(({ name, type, pk, notnull }) => ({
        name,
        type,
        pk,
        notnull,
      })),
    );
});
test("NSIS acceptance isolates registration / shortcuts without changing application identity or payload", () => {
  const {
    labConfig,
    LAB_GUID,
    LAB_NAME,
  } = require("../scripts/migration-install-profile.cjs");
  const production = require("../scripts/package-config.cjs").packageConfig({
    platform: "win32",
    arch: "x64",
    profile: "development",
  });
  const acceptance = labConfig("acceptance-output", "acceptance.nsh");
  assert.equal(acceptance.appId, production.appId);
  assert.equal(acceptance.executableName, production.executableName);
  assert.deepEqual(acceptance.files, production.files);
  assert.deepEqual(acceptance.extraResources, production.extraResources);
  assert.equal(acceptance.nsis.guid, LAB_GUID);
  assert.notEqual(acceptance.nsis.guid, production.nsis.guid);
  assert.equal(acceptance.nsis.shortcutName, LAB_NAME);
  assert.equal(acceptance.nsis.deleteAppDataOnUninstall, false);
  assert.equal(acceptance.nsis.runAfterFinish, false);
});
