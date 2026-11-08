const fs = require("node:fs"),
  path = require("node:path");
const { Storage } = require("../storage.cjs"),
  { Files } = require("../files.cjs"),
  { Chats } = require("../chats.cjs");
const { validate, ContractError } = require("../../contracts/validate.cjs"),
  { migrationContract } = require("../../contracts/migration.cjs");
const {
  fail,
  digest,
  canonical,
  json,
  safeId,
  milliseconds,
  writeJson,
  lease,
  copyDesktop,
  desktopFiles,
  readFile,
} = require("./common.cjs");
const { inspectSource, snapshotSource } = require("./source.cjs"),
  { sourceFiles, mapFilesAndPrompts } = require("./files.cjs"),
  { mapChatsAndBranches } = require("./graph.cjs"),
  {
    mapConnections,
    storeConnections,
    validateConnections,
  } = require("./connections.cjs");
const stages = [
  "inspected",
  "snapshotted",
  "files",
  "data",
  "validated",
  "activated",
];
function planSnapshot(snapshot) {
  const files = sourceFiles(snapshot),
    graphs = mapChatsAndBranches(snapshot, files),
    connectionPlan = {
      ...mapConnections(snapshot),
      userSettings: snapshot.userSettings,
    };
  const prompts = snapshot.tables.prompt.map((row) => ({
    value: validate("prompt", {
      id: safeId(row.id),
      command: row.command,
      name: row.name,
      content: row.content,
      updatedAt: require("./graph.cjs").preservedTime(
        row.updated_at,
        json(row.meta, {})?.scryletNodeUpdatedAt,
      ),
    }),
    raw: row,
  }));
  return {
    files,
    ...graphs,
    connectionPlan,
    prompts,
    counts: {
      chats: graphs.plans.length,
      messages: graphs.plans.reduce((n, p) => n + p.chat.messages.length, 0),
      files: files.length,
      prompts: prompts.length,
      connections: connectionPlan.connections.length,
      conflicts: graphs.conflicts,
    },
  };
}
function importData(storage, plan) {
  const files = new Files(storage),
    chats = new Chats(storage, files);
  for (const p of plan.plans) {
    chats.importGraph(p.chat, {
      sourceId: p.raw.id,
      sourceHash: p.sourceHash,
      raw: p.raw,
    });
    storage.transaction(() => {
      for (const [id, raw] of p.payloads)
        storage.db
          .prepare(
            "UPDATE messages SET legacy=?,provider_output=? WHERE chat_id=? AND id=?",
          )
          .run(
            canonical(raw),
            canonical(raw.node.output ?? null),
            p.chat.id,
            id,
          );
    });
  }
  storage.transaction(() => {
    for (const p of plan.prompts)
      storage.db
        .prepare(
          "INSERT OR IGNORE INTO prompts(id,command,name,content,updated_at,imported,user_modified,legacy) VALUES(?,?,?,?,?,1,1,?)",
        )
        .run(
          p.value.id,
          p.value.command,
          p.value.name,
          p.value.content,
          p.value.updatedAt,
          canonical(p.raw),
        );
    storage.db
      .prepare("INSERT OR IGNORE INTO product_state VALUES('prompt-seeds','1')")
      .run();
  });
}
async function validateTarget(storage, plan, secrets) {
  const files = new Files(storage),
    chats = new Chats(storage, files);
  if (
    storage.db.prepare("PRAGMA integrity_check").get().integrity_check !==
      "ok" ||
    storage.db.prepare("PRAGMA foreign_key_check").all().length
  )
    fail();
  for (const [table, n] of [
    ["chats", plan.counts.chats],
    ["messages", plan.counts.messages],
    ["files", plan.counts.files],
    ["prompts", plan.counts.prompts],
  ])
    if (storage.db.prepare(`SELECT count(*) n FROM ${table}`).get().n !== n)
      fail();
  for (const p of plan.plans)
    if (canonical(chats.get(p.chat.id)) !== canonical(p.chat)) fail();
  for (const f of plan.files)
    if (!files.read(f.id).bytes.equals(f.bytes)) fail();
  for (const p of plan.prompts) {
    const row = storage.db
      .prepare("SELECT * FROM prompts WHERE id=?")
      .get(p.value.id);
    if (
      row.content !== p.value.content ||
      row.command !== p.value.command ||
      row.updated_at !== p.value.updatedAt ||
      canonical(json(row.legacy)) !== canonical(p.raw)
    )
      fail();
  }
  await validateConnections(storage, plan.connectionPlan, secrets);
  return plan.counts;
}
function realDestination(value) {
  const full = path.resolve(value);
  let existing = full;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) fail();
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), path.relative(existing, full));
}
function disjoint(source, target) {
  const a = realDestination(source),
    b = realDestination(target),
    x = process.platform === "win32" ? a.toLowerCase() : a,
    y = process.platform === "win32" ? b.toLowerCase() : b;
  if (x === y || x.startsWith(y + path.sep) || y.startsWith(x + path.sep))
    fail();
}
async function activateTarget(staged, final, activation) {
  fs.mkdirSync(path.dirname(final), { recursive: true, mode: 0o700 });
  await require("./common.cjs").publishDirectory(staged, final);
  writeJson(
    path.join(final, "migration.json"),
    migrationContract("activation", activation),
  );
}
async function migrateOpenWebUI({
  sourceDirectory,
  targetDirectory,
  secretsFor,
  onCheckpoint = async () => {},
  onProgress = () => {},
  availableBytes,
} = {}) {
  if (
    typeof sourceDirectory !== "string" ||
    typeof targetDirectory !== "string" ||
    !path.isAbsolute(sourceDirectory) ||
    !path.isAbsolute(targetDirectory) ||
    typeof secretsFor !== "function"
  )
    fail();
  disjoint(sourceDirectory, targetDirectory);
  const final = path.join(targetDirectory, "chat-node/v1"),
    activationFile = path.join(final, "migration.json");
  if (fs.existsSync(activationFile)) {
    const activation = migrationContract(
      "activation",
      json(fs.readFileSync(activationFile, "utf8")),
    );
    const resolved = fs.existsSync(sourceDirectory)
        ? fs.realpathSync(sourceDirectory)
        : path.resolve(sourceDirectory),
      identity = digest(
        process.platform === "win32" ? resolved.toLowerCase() : resolved,
      );
    if (activation.sourceIdentity !== identity) fail();
    return migrationContract("report", {
      ...activation,
      status: "already-activated",
    });
  }
  const source = inspectSource(sourceDirectory);
  // Unknown source schemas have already failed above; never create an empty
  // target and call that a successful import. Existing new data is not replaced.
  const workspace = path.join(targetDirectory, "migrations/open-webui-v1"),
    stateFile = path.join(workspace, "state.json");
  fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
  const release = lease("migration-target:" + path.resolve(targetDirectory));
  let releaseSource = () => {},
    storage;
  try {
    require("./common.cjs").inside(targetDirectory, workspace);
    releaseSource = lease("legacy-source:" + source.root);
    let state = fs.existsSync(stateFile)
      ? migrationContract("state", json(fs.readFileSync(stateFile, "utf8")))
      : {
          schemaVersion: 1,
          runId: digest(source.identity),
          sourceIdentity: source.identity,
          stage: "inspected",
          snapshotHash: null,
          counts: null,
        };
    if (state.sourceIdentity !== source.identity) fail();
    const snapshotDirectory = path.join(workspace, "snapshot"),
      stageDirectory = path.join(workspace, "target"),
      staged = path.join(stageDirectory, "chat-node/v1");
    const checkpoint = async (stage) => {
      state = migrationContract("state", { ...state, stage });
      writeJson(stateFile, state);
      onProgress({
        stage,
        completed: stages.indexOf(stage) + 1,
        total: stages.length,
      });
      await onCheckpoint(stage);
    };
    if (fs.existsSync(final) && !fs.existsSync(activationFile)) {
      const stagedMarker = path.join(final, "migration-ready.json");
      if (state.stage !== "validated" || !fs.existsSync(stagedMarker))
        throw new ContractError("VERSION_CONFLICT", 409);
      const activation = migrationContract(
        "activation",
        json(fs.readFileSync(stagedMarker, "utf8")),
      );
      writeJson(activationFile, activation);
      await checkpoint("activated");
      return migrationContract("report", {
        ...activation,
        status: "activated",
      });
    }
    if (!fs.existsSync(stateFile)) await checkpoint("inspected");
    if (stages.indexOf(state.stage) < 1) {
      if (!fs.existsSync(snapshotDirectory))
        await snapshotSource(source, snapshotDirectory, { availableBytes });
      state.snapshotHash = json(
        fs.readFileSync(path.join(snapshotDirectory, "snapshot.json"), "utf8"),
      ).snapshotHash;
      await checkpoint("snapshotted");
    }
    require("./common.cjs").inside(workspace, snapshotDirectory);
    const snapshot = inspectSource(snapshotDirectory);
    if (
      digest(readFile(snapshotDirectory, snapshot.file)) !== state.snapshotHash
    )
      fail();
    const plan = planSnapshot(snapshot);
    state.counts = plan.counts;
    fs.mkdirSync(stageDirectory, { recursive: true, mode: 0o700 });
    require("./common.cjs").inside(workspace, stageDirectory);
    storage = new Storage(stageDirectory);
    const secrets = secretsFor(stageDirectory);
    if (stages.indexOf(state.stage) < 2) {
      mapFilesAndPrompts(storage, plan.files);
      await checkpoint("files");
    }
    // Staging is unpublished: re-encrypt its immutable source credentials if a
    // previous process died before the OS profile persisted an encryption key.
    await storeConnections(storage, plan.connectionPlan, secrets, state.runId);
    if (stages.indexOf(state.stage) < 3) {
      importData(storage, plan);
      await checkpoint("data");
    }
    await validateTarget(storage, plan, secrets);
    storage.db
      .prepare(
        "INSERT OR REPLACE INTO product_state VALUES('legacy-migration',?)",
      )
      .run(
        canonical({
          sourceIdentity: source.identity,
          snapshotHash: state.snapshotHash,
        }),
      );
    storage.close();
    storage = null;
    const activation = migrationContract("activation", {
      schemaVersion: 1,
      status: "validated",
      sourceIdentity: source.identity,
      snapshotHash: state.snapshotHash,
      counts: state.counts,
    });
    writeJson(path.join(staged, "migration-ready.json"), activation);
    await checkpoint("validated");
    const currentSource = inspectSource(sourceDirectory),
      manifest = json(
        fs.readFileSync(path.join(snapshotDirectory, "snapshot.json"), "utf8"),
      );
    if (
      digest(
        canonical({
          tables: currentSource.tables,
          userSettings: currentSource.userSettings,
        }),
      ) !== manifest.sourceContentHash
    )
      fail();
    const currentFiles = sourceFiles(currentSource);
    for (const file of manifest.sourceFiles)
      if (
        currentFiles.find((f) => f.sourceId === file.id)?.sha256 !== file.sha256
      )
        fail();
    // Desktop state is byte-preserved; normalization still forces old hints=true
    // to false at the existing capture-settings read boundary.
    for (const name of desktopFiles) {
      const from = path.join(snapshotDirectory, name),
        to = path.join(targetDirectory, name);
      if (fs.existsSync(from)) {
        if (fs.existsSync(to)) {
          if (
            !readFile(targetDirectory, to).equals(
              readFile(snapshotDirectory, from),
            )
          )
            throw new ContractError("VERSION_CONFLICT", 409);
        } else {
          fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
          fs.writeFileSync(to, readFile(snapshotDirectory, from), {
            mode: 0o600,
            flag: "wx",
          });
        }
      }
    }
    await activateTarget(staged, final, activation);
    await checkpoint("activated");
    return migrationContract("report", { ...activation, status: "activated" });
  } catch (error) {
    throw error instanceof ContractError
      ? error
      : new ContractError("MIGRATION_FAILED", 409);
  } finally {
    storage?.close();
    releaseSource();
    release();
  }
}
const resumeMigration = migrateOpenWebUI;
module.exports = {
  inspectSource,
  snapshotSource,
  mapConnections,
  mapChatsAndBranches,
  mapFilesAndPrompts,
  validateTarget,
  activateTarget,
  migrateOpenWebUI,
  resumeMigration,
  planSnapshot,
  importData,
  disjoint,
};
