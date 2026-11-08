const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { Storage } = require("../storage.cjs"),
  { Files } = require("../files.cjs"),
  { Chats } = require("../chats.cjs"),
  { migrationContract } = require("../../contracts/migration.cjs");
const {
  fail,
  digest,
  canonical,
  json,
  milliseconds,
  readFile,
  writeJson,
  copyDesktop,
  desktopFiles,
  lease,
} = require("./common.cjs");
const { inspectSource } = require("./source.cjs"),
  { disjoint } = require("./open-webui.cjs");
function seconds(ms) {
  if (!Number.isSafeInteger(ms) || ms < 0) fail();
  return Math.floor(ms / 1000);
}
function insert(db, table, row) {
  const columns = db.prepare(`PRAGMA table_info("${table}")`).all(),
    entries = Object.entries(row).filter(([key]) =>
      columns.some((c) => c.name === key),
    );
  db.prepare(
    `INSERT INTO "${table}" (${entries.map(([k]) => '"' + k + '"').join(",")}) VALUES(${entries.map(() => "?").join(",")})`,
  ).run(
    ...entries.map(([key, value]) =>
      value === null
        ? null
        : columns.find((c) => c.name === key).type === "JSON"
          ? canonical(value)
          : typeof value === "object"
            ? canonical(value)
            : key === "timer_at"
              ? BigInt(value)
              : value,
    ),
  );
}
function outputFor(message) {
  const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n"),
    reason = message.parts
      .filter((p) => p.type === "reasoning")
      .map((p) => p.text)
      .join("\n");
  return [
    ...(reason
      ? [
          {
            type: "reasoning",
            summary: [{ type: "summary_text", text: reason }],
            status: message.status === "completed" ? "completed" : "incomplete",
          },
        ]
      : []),
    {
      type: "message",
      role: message.role,
      content: [{ type: "output_text", text }],
      status: message.status === "completed" ? "completed" : "incomplete",
    },
  ];
}
async function exportRollback({
  targetDirectory,
  outputDirectory,
  secrets,
  onCheckpoint = async () => {},
} = {}) {
  if (
    !path.isAbsolute(targetDirectory || "") ||
    !path.isAbsolute(outputDirectory || "") ||
    typeof secrets !== "function"
  )
    fail();
  disjoint(targetDirectory, outputDirectory);
  if (fs.existsSync(outputDirectory)) fail();
  const activation = migrationContract(
      "activation",
      json(
        fs.readFileSync(
          path.join(targetDirectory, "chat-node/v1/migration.json"),
          "utf8",
        ),
      ),
    ),
    original = path.join(targetDirectory, "migrations/open-webui-v1/snapshot");
  const source = inspectSource(original);
  if (digest(readFile(original, source.file)) !== activation.snapshotHash)
    fail();
  const release = lease("rollback:" + path.resolve(targetDirectory));
  let storage, db;
  const pending = outputDirectory + "." + crypto.randomUUID() + ".pending";
  try {
    storage = new Storage(targetDirectory);
    if (
      storage.db
        .prepare(
          "SELECT 1 FROM generations WHERE status IN ('accepted','requesting','streaming')",
        )
        .get()
    )
      fail();
    const { DatabaseSync, backup } = require("node:sqlite");
    fs.mkdirSync(path.join(pending, "open-webui/uploads"), {
      recursive: true,
      mode: 0o700,
    });
    const originalDb = new DatabaseSync(source.file, { readOnly: true });
    try {
      await backup(originalDb, path.join(pending, "open-webui/webui.db"));
    } finally {
      originalDb.close();
    }
    fs.mkdirSync(path.join(pending, "node-snapshot/chat-node/v1/files"), {
      recursive: true,
      mode: 0o700,
    });
    await backup(
      storage.db,
      path.join(pending, "node-snapshot/chat-node/v1/chat.sqlite"),
    );
    for (const file of ["secrets.json", "migration.json"]) {
      const from = path.join(storage.root, file);
      if (fs.existsSync(from))
        fs.writeFileSync(
          path.join(pending, "node-snapshot/chat-node/v1", file),
          readFile(storage.root, from),
          { mode: 0o600 },
        );
    }
    const localState = path.join(targetDirectory, "Local State");
    if (fs.existsSync(localState))
      fs.writeFileSync(
        path.join(pending, "node-snapshot/Local State"),
        readFile(targetDirectory, localState),
        { mode: 0o600, flag: "wx" },
      );
    const files = new Files(storage),
      chats = new Chats(storage, files),
      allChats = storage.db
        .prepare("SELECT id FROM chats ORDER BY rowid")
        .all()
        .map((r) => chats.get(r.id)),
      allFiles = storage.db
        .prepare("SELECT id FROM files ORDER BY rowid")
        .all()
        .map((r) => files.read(r.id));
    for (const { value, bytes } of allFiles) {
      fs.writeFileSync(
        path.join(pending, "open-webui/uploads", value.id + ".image"),
        bytes,
        { mode: 0o600, flag: "wx" },
      );
      fs.writeFileSync(
        path.join(
          pending,
          "node-snapshot/chat-node/v1/files",
          value.id + ".image",
        ),
        bytes,
        { mode: 0o600, flag: "wx" },
      );
    }
    copyDesktop(targetDirectory, pending);
    await onCheckpoint("new-snapshot");
    db = new DatabaseSync(path.join(pending, "open-webui/webui.db"));
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;");
    for (const table of [
      "chat_message",
      "chat_file",
      "chatidtag",
      "chat",
      "model",
      "prompt",
    ])
      db.exec(`DELETE FROM "${table}"`);
    for (const { value } of allFiles) {
      db.prepare("DELETE FROM file WHERE id=?").run(value.id);
      const old = source.tables.file.find((r) => r.id === value.id) || {};
      insert(db, "file", {
        ...old,
        id: value.id,
        user_id: source.userId,
        filename: value.name,
        path: path.join(
          outputDirectory,
          "open-webui/uploads",
          value.id + ".image",
        ),
        hash: value.sha256,
        meta: {
          ...json(old.meta, {}),
          name: value.name,
          content_type: value.mime,
          size: value.bytes,
          file_hash: value.sha256,
          width: value.width,
          height: value.height,
        },
        data: json(old.data, {}),
        created_at: seconds(value.createdAt),
        updated_at: seconds(value.createdAt),
      });
    }
    // Remove files no longer present in the Node store, including source-only
    // rows, so rollback never resurrects a deleted current file reference.
    for (const row of source.tables.file)
      if (!allFiles.some((f) => f.value.id === row.id))
        db.prepare("DELETE FROM file WHERE id=?").run(row.id);
    for (const chat of allChats) {
      const stored = storage.db
          .prepare("SELECT legacy FROM chats WHERE id=?")
          .get(chat.id),
        raw = json(stored.legacy, {}),
        blob = json(raw.chat, {}),
        messages = {};
      for (const m of chat.messages) {
        const persisted = storage.db
            .prepare(
              "SELECT legacy,provider_output FROM messages WHERE chat_id=? AND id=?",
            )
            .get(chat.id, m.id),
          legacy = json(persisted.legacy, {}),
          node = legacy.node || {},
          attachments = m.parts
            .filter((p) => p.type === "image")
            .map((p) => {
              const value = files.get(p.fileId);
              return {
                type: "file",
                id: value.id,
                url: value.id,
                name: value.name,
                status: "uploaded",
                content_type: value.mime,
                size: value.bytes,
                file: {
                  id: value.id,
                  filename: value.name,
                  meta: {
                    name: value.name,
                    content_type: value.mime,
                    size: value.bytes,
                  },
                },
              };
            });
        const output = Array.isArray(json(persisted.provider_output))
          ? json(persisted.provider_output)
          : m.role === "assistant"
            ? outputFor(m)
            : null;
        messages[m.id] = {
          ...node,
          id: m.id,
          parentId: m.parentMessageId,
          childrenIds: chat.messages
            .filter((n) => n.parentMessageId === m.id)
            .map((n) => n.id),
          role: m.role,
          content: m.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("\n"),
          files: attachments,
          model: m.modelId,
          models: m.role === "user" ? [chat.modelId] : node.models,
          timestamp: seconds(m.createdAt),
          done: m.status !== "interrupted",
          output,
          meta: {
            ...node.meta,
            scryletNodeStatus: m.status,
            scryletNodeCreatedAt: m.createdAt,
            scryletNodeProviderOutput: json(persisted.provider_output),
          },
        };
        const normalized = legacy.normalized || {};
        insert(db, "chat_message", {
          ...normalized,
          id: chat.id + "-" + m.id,
          chat_id: chat.id,
          user_id: source.userId,
          parent_id: m.parentMessageId,
          role: m.role,
          content: messages[m.id].content,
          model_id: m.modelId,
          files: attachments,
          output,
          meta: messages[m.id].meta,
          done: m.status === "interrupted" ? 0 : 1,
          error:
            m.status === "failed" ? { error: { content: "生成未完成" } } : null,
          created_at: seconds(m.createdAt),
          updated_at: seconds(chat.updatedAt),
        });
        for (const attachment of attachments)
          if (
            !db
              .prepare("SELECT 1 FROM chat_file WHERE chat_id=? AND file_id=?")
              .get(chat.id, attachment.id)
          )
            insert(db, "chat_file", {
              id: crypto.randomUUID(),
              user_id: source.userId,
              chat_id: chat.id,
              file_id: attachment.id,
              message_id: m.id,
              created_at: seconds(m.createdAt),
              updated_at: seconds(chat.updatedAt),
            });
      }
      const current = chat.currentMessageId,
        linear = [];
      for (let node = messages[current]; node; node = messages[node.parentId])
        linear.unshift(node);
      insert(db, "chat", {
        ...raw,
        id: chat.id,
        user_id: source.userId,
        title: chat.title,
        chat: {
          ...blob,
          id: chat.id,
          title: chat.title,
          models: [chat.modelId],
          history: { ...blob.history, messages, currentId: current },
          messages: linear,
          timestamp: chat.createdAt,
        },
        created_at: seconds(chat.createdAt),
        updated_at: seconds(chat.updatedAt),
        current_message_id: current,
        pinned: Number(chat.pinned),
        archived: Number(chat.archived),
        last_read_at:
          chat.lastReadAt === null ? null : seconds(chat.lastReadAt),
        meta: {
          ...json(raw.meta, {}),
          scryletNodeVersion: chat.version,
          scryletNodeTimes: {
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            lastReadAt: chat.lastReadAt,
          },
        },
      });
    }
    const models = json(
        storage.db
          .prepare("SELECT value FROM product_state WHERE key='legacy-models'")
          .get()?.value,
        [],
      ),
      connections = storage.db
        .prepare("SELECT * FROM provider_connections ORDER BY rowid")
        .all(),
      keys = [],
      urls = [],
      configs = {};
    for (const [index, c] of connections.entries()) {
      keys.push(
        c.deleted || !c.secret_ref
          ? ""
          : ((await secrets({
              operation: "get",
              providerId: c.provider_id,
              secretRef: c.secret_ref,
            })) ?? fail()),
      );
      urls.push(c.base_url);
      configs[index] = {
        ...json(c.legacy, {}).config,
        enable: Boolean(c.enabled && !c.deleted),
        prefix_id: c.provider_id,
        api_type: c.api_type,
        model_ids: json(c.model_ids),
      };
      for (const upstream of json(c.model_ids)) {
        const modelId = c.provider_id + "." + upstream;
        if (!models.some((m) => m.id === modelId))
          models.push({
            id: modelId,
            providerId: c.provider_id,
            upstreamModel: upstream,
            name:
              require("../../config/providers.json").providers.find(
                (p) => p.id === c.provider_id,
              )?.labels?.[upstream] || upstream,
            active: true,
            vision: true,
            params: {},
            raw: {},
          });
      }
    }
    for (const model of models)
      insert(db, "model", {
        ...model.raw,
        id: model.id,
        user_id: source.userId,
        name: model.name,
        base_model_id: model.raw?.base_model_id || null,
        is_active: Number(model.active),
        params: canonical(model.params),
        meta: canonical({
          ...json(model.raw?.meta, {}),
          capabilities: {
            ...json(model.raw?.meta, {}).capabilities,
            vision: model.vision,
          },
        }),
        version_id: model.raw?.version_id || crypto.randomUUID(),
        created_at: model.raw?.created_at || seconds(Date.now()),
        updated_at: seconds(Date.now()),
      });
    for (const [key, value] of [
      ["openai.api_keys", keys],
      ["openai.api_base_urls", urls],
      ["openai.api_configs", configs],
    ])
      db.prepare(
        "INSERT INTO config(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      ).run(key, canonical(value), seconds(Date.now()));
    const prompts = storage.db
      .prepare("SELECT * FROM prompts ORDER BY rowid")
      .all();
    for (const p of prompts) {
      const raw = json(p.legacy, {});
      insert(db, "prompt", {
        ...raw,
        id: p.id,
        user_id: source.userId,
        command: p.command,
        name: p.name,
        content: p.content,
        data: raw.data || {},
        meta: { ...json(raw.meta, {}), scryletNodeUpdatedAt: p.updated_at },
        tags: raw.tags || ["Scrylet"],
        is_active: raw.is_active ?? 1,
        version_id: raw.version_id || crypto.randomUUID(),
        created_at: raw.created_at || seconds(p.updated_at),
        updated_at: seconds(p.updated_at),
      });
    }
    db.exec("COMMIT");
    if (
      db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
      db.prepare("PRAGMA foreign_key_check").all().length
    )
      fail();
    const expected = {
      chats: allChats.length,
      messages: allChats.reduce((n, c) => n + c.messages.length, 0),
      files: allFiles.length,
      prompts: prompts.length,
      connections: connections.length,
      conflicts: activation.counts.conflicts,
    };
    for (const [table, count] of [
      ["chat", expected.chats],
      ["chat_message", expected.messages],
      ["file", expected.files],
      ["prompt", expected.prompts],
    ])
      if (db.prepare(`SELECT count(*) n FROM ${table}`).get().n !== count)
        fail();
    for (const chat of allChats) {
      const row = db
          .prepare("SELECT chat,current_message_id FROM chat WHERE id=?")
          .get(chat.id),
        legacy = json(row.chat);
      if (
        row.current_message_id !== chat.currentMessageId ||
        Object.keys(legacy.history.messages).length !== chat.messages.length
      )
        fail();
      for (const m of chat.messages)
        if (
          legacy.history.messages[m.id].content !==
          m.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("\n")
        )
          fail();
    }
    db.close();
    db = null;
    await onCheckpoint("legacy-copy");
    const report = migrationContract("report", {
      schemaVersion: 1,
      status: "rollback-validated",
      sourceIdentity: activation.sourceIdentity,
      snapshotHash: digest(
        readFile(pending, path.join(pending, "open-webui/webui.db")),
      ),
      counts: expected,
    });
    writeJson(path.join(pending, "rollback.json"), report);
    await require("./common.cjs").publishDirectory(pending, outputDirectory);
    return report;
  } catch (error) {
    if (error instanceof require("../../contracts/validate.cjs").ContractError)
      throw error;
    const failure = new (require("../../contracts/validate.cjs").ContractError)(
      "MIGRATION_FAILED",
      409,
    );
    Object.defineProperty(failure, "cause", { value: error });
    throw failure;
  } finally {
    db?.close();
    storage?.close();
    release();
  }
}
module.exports = { exportRollback, insert, seconds, outputFor };
