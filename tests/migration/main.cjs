const { app, safeStorage } = require("electron"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const directory = process.env.SNAP_MIGRATION_TEST_DIR;
if (!directory || !path.isAbsolute(directory)) process.exit(2);
app.setPath("userData", path.join(directory, "node"));
const { Storage } = require("../../service/storage.cjs"),
  { Files } = require("../../service/files.cjs"),
  { Chats } = require("../../service/chats.cjs"),
  { Providers } = require("../../service/providers.cjs");
const { createSecrets } = require("../../desktop/secrets.cjs"),
  { migrateLegacy, rollbackLegacy } = require("../../desktop/migration.cjs"),
  { inspectSource } = require("../../service/migrations/source.cjs"),
  { legacyFixture, cloneSource, fixture } = require("./fixture.cjs");
const report = {
  status: "running",
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  checks: [],
  sourceFixture: "frozen 0.12.2 business tables with synthetic user",
};
let storage, mock, runtime;
const check = (name) => report.checks.push(name);
app
  .whenReady()
  .then(async () => {
    mock =
      await require("../fixtures/protocol-provider.cjs").protocolProvider();
    const source = await legacyFixture(
        path.join(directory, "legacy"),
        mock.baseURL,
      ),
      target = path.join(directory, "node");
    report.source = {
      chats: fixture.tables.chat.rows.length,
      messages: fixture.tables.chat_message.rows.length,
      files: fixture.tables.file.rows.length,
    };
    const before = require("../../service/migrations/common.cjs").digest(
      fs.readFileSync(path.join(source.directory, "open-webui/webui.db")),
    );
    const migrated = await migrateLegacy(source.directory, target, safeStorage);
    assert.equal(migrated.status, "activated");
    assert.equal(migrated.counts.chats, 2);
    assert.equal(migrated.counts.messages, 10);
    assert.equal(migrated.counts.files, 2);
    assert.equal(
      require("../../service/migrations/common.cjs").digest(
        fs.readFileSync(path.join(source.directory, "open-webui/webui.db")),
      ),
      before,
    );
    check("frozen-legacy-format-readonly-snapshot-activation");
    storage = new Storage(target);
    const files = new Files(storage),
      chats = new Chats(storage, files),
      secrets = createSecrets(target, safeStorage),
      providers = new Providers(storage, secrets);
    const chat = chats.get(source.chatId);
    assert.equal(chat.messages.length, 5);
    assert.equal(
      chat.currentMessageId,
      fixture.tables.chat.rows[0].current_message_id,
    );
    assert.ok(
      files
        .read(source.imageId)
        .bytes.equals(Buffer.from(fixture.attachments[0].base64, "base64")),
    );
    assert.equal(
      providers.directory().providers.find((p) => p.id === "openai").configured,
      false,
    );
    assert.equal(
      providers.directory().providers.find((p) => p.id === "alibaba")
        .configured,
      true,
    );
    check("graph-branches-pointer-image-byte-key-deletion-preserved");
    storage.close();
    storage = null;
    const again = await migrateLegacy(source.directory, target, safeStorage);
    assert.equal(again.status, "already-activated");
    check("repeat-import-no-reseed");
    for (const interrupted of [
      "inspected",
      "snapshotted",
      "files",
      "data",
      "validated",
      "activated",
    ]) {
      const next = path.join(directory, "interrupt-" + interrupted);
      let failed = false;
      try {
        await migrateLegacy(source.directory, next, safeStorage, {
          onCheckpoint: async (stage) => {
            if (stage === interrupted) throw Error("INJECTED_EXIT");
          },
        });
      } catch (error) {
        failed = true;
        assert.equal(error.code, "MIGRATION_FAILED");
      }
      assert.equal(failed, true);
      const resumed = await migrateLegacy(source.directory, next, safeStorage);
      assert.ok(["activated", "already-activated"].includes(resumed.status));
      assert.equal(resumed.counts.messages, 10);
      const stored = new Storage(next);
      assert.equal(
        stored.db.prepare("SELECT count(*) n FROM messages").get().n,
        10,
      );
      stored.close();
      check("resume-after-" + interrupted);
    }
    const low = path.join(directory, "low-space");
    await assert.rejects(
      migrateLegacy(source.directory, low, safeStorage, { availableBytes: 0 }),
      { code: "MIGRATION_FAILED" },
    );
    assert.equal(
      fs.existsSync(path.join(low, "chat-node/v1/chat.sqlite")),
      false,
    );
    await migrateLegacy(source.directory, low, safeStorage);
    check("insufficient-space-no-empty-success-resume");
    const { DatabaseSync } = require("node:sqlite");
    const walRoot = cloneSource(
      source.directory,
      path.join(directory, "wal-source"),
    );
    const wal = new DatabaseSync(path.join(walRoot, "open-webui/webui.db"));
    try {
      wal.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
      wal
        .prepare("UPDATE chat SET title=? WHERE id=?")
        .run("WAL 中已提交的标题", source.chatId);
      assert.ok(
        fs.statSync(path.join(walRoot, "open-webui/webui.db-wal")).size > 0,
      );
      const snapshot = path.join(directory, "wal-snapshot");
      await require("../../service/migrations/source.cjs").snapshotSource(
        inspectSource(walRoot),
        snapshot,
      );
      assert.equal(
        inspectSource(snapshot).tables.chat.find((c) => c.id === source.chatId)
          .title,
        "WAL 中已提交的标题",
      );
    } finally {
      wal.close();
    }
    check("actual-committed-WAL-frames-in-consistent-SQLite-backup");
    const aliasRoot = cloneSource(
      source.directory,
      path.join(directory, "model-alias-source"),
    );
    const aliasDb = new DatabaseSync(
      path.join(aliasRoot, "open-webui/webui.db"),
    );
    try {
      const original = aliasDb
        .prepare("SELECT * FROM model WHERE id='alibaba.qwen3.8-max'")
        .get();
      require("../../service/migrations/rollback.cjs").insert(
        aliasDb,
        "model",
        {
          ...original,
          id: "m4-alias",
          base_model_id: "alibaba.qwen3.8-max",
          name: "保留用户模型名称",
          params: JSON.stringify({
            temperature: 0.25,
            top_k: 44,
            system: "迁移后保留的模型指令",
            stop: ["END"],
          }),
          meta: JSON.stringify({
            capabilities: { vision: false },
            unknown: "retained",
          }),
        },
      );
    } finally {
      aliasDb.close();
    }
    const aliasTarget = path.join(directory, "model-alias-target");
    await migrateLegacy(aliasRoot, aliasTarget, safeStorage);
    const aliasStorage = new Storage(aliasTarget);
    try {
      const provider = new Providers(
        aliasStorage,
        createSecrets(aliasTarget, safeStorage),
      );
      const visible = provider.models().find((m) => m.id === "m4-alias");
      assert.equal(visible.name, "保留用户模型名称");
      assert.equal(visible.vision, false);
      await provider.generate("m4-alias", [
        { role: "user", content: "验证用户模型参数" },
      ]);
      const sent = mock.requests.at(-1).body;
      assert.equal(sent.model, "qwen3.8-max");
      assert.equal(sent.temperature, 0.25);
      assert.equal(sent.top_k, 44);
      assert.deepEqual(sent.stop, ["END"]);
      assert.equal(sent.messages[0].role, "system");
    } finally {
      aliasStorage.close();
    }
    check("legacy-custom-model-id-name-capability-and-real-SDK-parameters");
    await assert.rejects(
      migrateLegacy(source.directory, source.directory, safeStorage),
      { code: "MIGRATION_FAILED" },
    );
    check("source-target-overlap-refused-before-writing");
    const bad = cloneSource(
        source.directory,
        path.join(directory, "unknown-schema"),
      ),
      badDb = new DatabaseSync(path.join(bad, "open-webui/webui.db"));
    badDb.exec("ALTER TABLE chat ADD COLUMN unexpected TEXT");
    badDb.close();
    await assert.rejects(
      migrateLegacy(bad, path.join(directory, "bad-target"), safeStorage),
      { code: "MIGRATION_FAILED" },
    );
    assert.equal(
      fs.existsSync(path.join(directory, "bad-target/chat-node")),
      false,
    );
    check("unknown-schema-refused-before-target-open");
    const missing = cloneSource(
      source.directory,
      path.join(directory, "missing-image"),
    );
    fs.unlinkSync(
      path.join(missing, "open-webui/uploads", source.imageId + ".image"),
    );
    await assert.rejects(
      migrateLegacy(
        missing,
        path.join(directory, "missing-target"),
        safeStorage,
      ),
      { code: "MIGRATION_FAILED" },
    );
    check("missing-attachment-blocks-activation");
    const wrong = cloneSource(
        source.directory,
        path.join(directory, "wrong-config"),
      ),
      wrongDb = new DatabaseSync(path.join(wrong, "open-webui/webui.db"));
    const config = JSON.parse(
      wrongDb
        .prepare("SELECT value FROM config WHERE key='openai.api_configs'")
        .get().value,
    );
    config["3"].enable = "yes";
    wrongDb
      .prepare("UPDATE config SET value=? WHERE key='openai.api_configs'")
      .run(JSON.stringify(config));
    wrongDb.close();
    await assert.rejects(
      migrateLegacy(wrong, path.join(directory, "config-target"), safeStorage),
      { code: "MIGRATION_FAILED" },
    );
    check("invalid-provider-config-keeps-source-and-gate");
    const conflict = cloneSource(
        source.directory,
        path.join(directory, "conflict"),
      ),
      conflictDb = new DatabaseSync(path.join(conflict, "open-webui/webui.db"));
    const conflicted = conflictDb
      .prepare("SELECT id FROM chat_message WHERE role='assistant' LIMIT 1")
      .get();
    conflictDb
      .prepare("UPDATE chat_message SET content=? WHERE id=?")
      .run(JSON.stringify("normalized 另一个版本"), conflicted.id);
    conflictDb.close();
    const conflictTarget = path.join(directory, "conflict-target"),
      conflictReport = await migrateLegacy(
        conflict,
        conflictTarget,
        safeStorage,
      );
    assert.equal(conflictReport.counts.conflicts, 1);
    assert.equal(conflictReport.counts.messages, 15);
    check("embedded-normalized-conflict-preserves-two-graphs");
    const lock = require("../../service/migrations/common.cjs").lease(
      "legacy-source:" + fs.realpathSync(source.directory),
    );
    try {
      await assert.rejects(
        migrateLegacy(
          source.directory,
          path.join(directory, "locked-target"),
          safeStorage,
        ),
        { code: "VERSION_CONFLICT" },
      );
    } finally {
      lock();
    }
    await migrateLegacy(
      source.directory,
      path.join(directory, "locked-target"),
      safeStorage,
    );
    check("exclusive-source-lease-refuses-writer-and-releases-on-failure");
    // Add a real SDK image round, sibling regeneration, a new chat, prompts and
    // provider edits in the new store, then read the reverse conversion in 0.12.2.
    storage = new Storage(target);
    const currentFiles = new Files(storage),
      currentChats = new Chats(storage, currentFiles),
      currentProviders = new Providers(storage, secrets);
    const currentProvider = currentProviders.row("alibaba");
    await currentProviders.save("alibaba", {
      apiVersion: 1,
      providerId: "alibaba",
      revision: currentProvider.revision,
      baseUrl: mock.baseURL,
      apiType: "chat",
      keyAction: "set",
      apiKey: "synthetic-m4-new-only",
      modelIds: JSON.parse(currentProvider.model_ids),
    });
    const newFile = currentFiles.put(
        Buffer.from(fixture.attachments[1].base64, "base64"),
        { name: "M4 新图片.jpg", mime: "image/jpeg" },
      ),
      generations = new (require("../../service/generations.cjs").Generations)(
        storage,
        currentChats,
        currentFiles,
        currentProviders,
      );
    const awaitDone = async (id) => {
      const end = Date.now() + 20000;
      while (generations.get(id).status !== "completed") {
        if (
          ["failed", "stopped", "interrupted"].includes(
            generations.get(id).status,
          ) ||
          Date.now() > end
        )
          throw Error("NEW_ROUND_FAILED");
        await new Promise((r) => setTimeout(r, 20));
      }
    };
    let c = currentChats.get(source.chatId);
    let accepted = generations.submit(c.id, "migration-device", {
      apiVersion: 1,
      requestId: "migration-new-round",
      chatVersion: c.version,
      parentMessageId: c.currentMessageId,
      modelId: c.modelId,
      origin: "manual",
      parts: [
        { type: "text", text: "M4 新增图文消息" },
        { type: "image", fileId: newFile.id },
      ],
    });
    await awaitDone(accepted.generationId);
    c = currentChats.get(c.id);
    accepted = generations.submit(c.id, "migration-device", {
      apiVersion: 1,
      requestId: "migration-regenerate",
      chatVersion: c.version,
      parentMessageId: c.messages.find(
        (m) => m.id === accepted.assistantMessageId,
      ).parentMessageId,
      modelId: c.modelId,
      origin: "manual",
      action: "regenerate",
      targetMessageId: accepted.assistantMessageId,
      parts: [],
    });
    await awaitDone(accepted.generationId);
    c = currentChats.get(c.id);
    assert.equal(c.messages.length, 8);
    const newChat = currentChats.create({
      apiVersion: 1,
      title: "M4 新版新增会话",
      modelId: c.modelId,
    });
    const prompts = new (require("../../service/prompts.cjs").Prompts)(storage),
      firstPrompt = prompts.list()[0];
    prompts.save({
      apiVersion: 1,
      id: firstPrompt.id,
      command: firstPrompt.command,
      name: firstPrompt.name,
      expectedUpdatedAt: firstPrompt.updatedAt,
      content: "M4 新版修改的提示词",
    });
    const originalOpenai = currentProviders.row("openai");
    await currentProviders.save("openai", {
      apiVersion: 1,
      providerId: "openai",
      revision: originalOpenai.revision,
      baseUrl: originalOpenai.base_url,
      apiType: "responses",
      keyAction: "set",
      apiKey: "synthetic-delete-new-key",
      modelIds: JSON.parse(originalOpenai.model_ids),
    });
    await currentProviders.save("openai", {
      apiVersion: 1,
      providerId: "openai",
      revision: originalOpenai.revision + 1,
      baseUrl: originalOpenai.base_url,
      apiType: "responses",
      keyAction: "delete",
      modelIds: JSON.parse(originalOpenai.model_ids),
    });
    const currentJSON = JSON.stringify(currentChats.get(c.id));
    await migrateLegacy(source.directory, target, safeStorage);
    assert.equal(JSON.stringify(currentChats.get(c.id)), currentJSON);
    assert.equal(currentProviders.row("openai").deleted, 1);
    assert.equal(currentProviders.row("openai").revision, 3);
    check("repeat-import-keeps-new-round-branch-and-deleted-new-key");
    currentChats.writeDraft("migration-device", c.id, {
      apiVersion: 1,
      browserClientId: "migration-browser",
      expectedRevision: 0,
      modelId: c.modelId,
      parts: [
        { type: "text", text: "新版已保存草稿" },
        { type: "image", fileId: newFile.id },
      ],
    });
    await assert.rejects(
      rollbackLegacy(
        target,
        path.join(directory, "busy-rollback"),
        safeStorage,
      ),
    );
    check("rollback-rejects-active-new-writer");
    await generations.close();
    storage.close();
    storage = null;
    // The CLI exports a stopped profile. This in-process fixture must let
    // Electron persist its newly created Windows encryption identity first.
    if (process.platform === "win32") {
      const until = Date.now() + 15000;
      for (;;) {
        let persisted = false;
        try { persisted = Boolean(JSON.parse(fs.readFileSync(path.join(target, "Local State"), "utf8")).os_crypt?.encrypted_key); } catch {}
        if (persisted) break;
        if (Date.now() >= until) throw Error("FIXTURE_ENCRYPTION_IDENTITY_NOT_PERSISTED");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    const newBefore = require("../../service/migrations/common.cjs").digest(
        fs.readFileSync(path.join(target, "chat-node/v1/chat.sqlite")),
      ),
      rollback = path.join(directory, "旧版 回退.副本"),
      rolled = await rollbackLegacy(target, rollback, safeStorage);
    assert.equal(rolled.status, "rollback-validated");
    assert.equal(rolled.counts.chats, 3);
    assert.equal(rolled.counts.messages, 13);
    assert.equal(
      require("../../service/migrations/common.cjs").digest(
        fs.readFileSync(path.join(target, "chat-node/v1/chat.sqlite")),
      ),
      newBefore,
    );
    check("rollback-export-keeps-new-database-and-readable-node-snapshot");
    const exported = inspectSource(rollback);
    const oldChat = exported.tables.chat.find(row => row.id === c.id);
    const oldGraph = oldChat.chat;
    assert.equal(Object.keys(oldGraph.history.messages).length, 8);
    assert.equal(oldChat.current_message_id, c.currentMessageId);
    assert.equal(exported.tables.chat.find(row => row.id === newChat.id).title, newChat.title);
    assert.equal(exported.tables.prompt.find(row => row.command === firstPrompt.command).content, "M4 新版修改的提示词");
    const exportedImage = exported.tables.file.find(row => row.id === newFile.id);
    assert.ok(fs.readFileSync(exportedImage.path).equals(Buffer.from(fixture.attachments[1].base64, "base64")));
    check("exported-legacy-schema-retains-new-graph-image-and-prompts");
    report.legacyRuntimeReadback = "not rerun; original assertions and prior evidence retained in archive";
    const nodeCopy = new Storage(path.join(rollback, "node-snapshot"));
    assert.equal(
      new Chats(nodeCopy, new Files(nodeCopy)).readDraft(
        "migration-device",
        "migration-browser",
        c.id,
      ).parts[0].text,
      "新版已保存草稿",
    );
    nodeCopy.close();
    check("new-draft-retained-in-node-readable-snapshot");
    assert.equal(
      require("../../service/migrations/common.cjs").digest(
        fs.readFileSync(path.join(source.directory, "open-webui/webui.db")),
      ),
      before,
    );
    check("original-source-unmodified-after-entire-roundtrip");
    report.status = "passed";
    report.migrated = migrated;
    report.target = target;
    report.rollbackDirectory = rollback;
  })
  .catch((error) => {
    report.status = "failed";
    report.code = error.code || "MIGRATION_TEST_FAILED";
    if (error.cause) report.cause = { code: error.cause.code || "UNKNOWN", location: String(error.cause.stack || "").split("\n").filter(l => l.trim().startsWith("at ")).slice(0, 5) };
    report.location = String(error.stack || "")
      .split("\n")
      .filter((l) => l.trim().startsWith("at "))
      .slice(0, 5);
  })
  .finally(async () => {
    storage?.close();
    await runtime?.stop();
    await mock?.stop();
    fs.writeFileSync(
      path.join(directory, "report.json"),
      JSON.stringify(report, null, 2),
    );
    app.exit(report.status === "passed" ? 0 : 1);
  });
setTimeout(() => app.exit(3), 540000).unref();
