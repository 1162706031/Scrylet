const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { validateInitialize, isShutdown } = require("./protocol.cjs");
let initialized = false, hold, watchdog;
const send = value => process.parentPort.postMessage({ protocolVersion: 1, ...value });

async function storageProbe(directory) {
  const { DatabaseSync, backup } = require("node:sqlite");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "probe.sqlite");
  const db = new DatabaseSync(file);
  let second, copy;
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=25; CREATE TABLE parent(id INTEGER PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));");
    const text = "fixture-数学";
    db.prepare("INSERT INTO parent(id,value) VALUES(?,?)").run(1, text);
    db.exec("BEGIN IMMEDIATE; INSERT INTO parent VALUES(2,'rollback'); ROLLBACK;");
    assert.equal(db.prepare("SELECT count(*) AS n FROM parent").get().n, 1);
    assert.throws(() => db.prepare("INSERT INTO child VALUES(?,?)").run(1, 999));
    second = new DatabaseSync(file);
    second.exec("PRAGMA busy_timeout=25;"); db.exec("BEGIN IMMEDIATE;");
    assert.throws(() => second.exec("BEGIN IMMEDIATE;"), /locked|busy/i);
    db.exec("ROLLBACK;"); second.close(); second = null;
    const pages = await backup(db, path.join(directory, "snapshot.sqlite"));
    copy = new DatabaseSync(path.join(directory, "snapshot.sqlite"), { readOnly: true });
    assert.equal(copy.prepare("SELECT value FROM parent WHERE id=?").get(1).value, text);
    const journalMode = db.prepare("PRAGMA journal_mode").get().journal_mode;
    assert.equal(journalMode, "wal");
    const sqliteVersion = db.prepare("SELECT sqlite_version() AS version").get().version;
    return { driver: "node:sqlite DatabaseSync", sqliteVersion, foreignKeys: true, rollback: true,
      secondWriterRejected: true, journalMode, backupPages: pages, backupReadable: true,
      fixtureHash: crypto.createHash("sha256").update(text).digest("hex"),
      dataOutsideAsar: !file.includes(".asar" + path.sep) };
  } finally { second?.close(); copy?.close(); db.close(); }
}

async function sdkProbe({ baseURL, secret }) {
  const entries = ["ai", "@ai-sdk/openai", "@ai-sdk/openai-compatible"].map(name => require.resolve(name));
  const resolvedFromAsar = entries.every(file => file.includes(".asar" + path.sep));
  if (__filename.includes(".asar" + path.sep)) assert.equal(resolvedFromAsar, true);
  const { generateText, streamText } = await import(pathToFileURL(entries[0]).href);
  const { createOpenAI } = await import(pathToFileURL(entries[1]).href);
  const { createOpenAICompatible } = await import(pathToFileURL(entries[2]).href);
  const onlyMock = (input, options) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== new URL(baseURL).origin) throw new Error("COMPAT_EXTERNAL_FETCH_REJECTED");
    return fetch(input, options);
  };
  const compatible = createOpenAICompatible({ name: "fixture", apiKey: secret, baseURL, fetch: onlyMock });
  const stream = streamText({ model: compatible("fixture-chat"), prompt: "compatibility fixture", maxRetries: 0 });
  let streamed = "";
  for await (const text of stream.textStream) streamed += text;
  assert.ok(streamed.length > 0);
  const openai = createOpenAI({ apiKey: secret, baseURL, fetch: onlyMock });
  const response = await generateText({ model: openai.responses("fixture-responses"), prompt: "compatibility fixture", maxRetries: 0 });
  assert.ok(response.text.length > 0);
  return { ai: require("ai/package.json").version, openai: require("@ai-sdk/openai/package.json").version,
    compatible: require("@ai-sdk/openai-compatible/package.json").version, esmImportedFromCjs: true,
    resolvedFromAsar, esmImportsForcedToResolvedFile: true,
    chatStreamCharacters: streamed.length, responsesCharacters: response.text.length, maxRetries: 0 };
}

process.parentPort.on("message", async ({ data }) => {
  if (isShutdown(data)) {
    clearInterval(hold); clearInterval(watchdog); send({ type: "stopped" }); setImmediate(() => process.exit(0)); return;
  }
  let phase = "initialize";
  try {
    if (initialized) throw new Error("COMPAT_DUPLICATE_INITIALIZE");
    const value = validateInitialize(data); initialized = true;
    // The official parentPort contract documents message only, not a close
    // event. Explicit parent existence checking is tested after parent kill.
    watchdog = setInterval(() => {
      try { process.kill(value.parentPid, 0); } catch (error) { if (error.code === "ESRCH") process.exit(0); }
    }, 250);
    if (value.mode === "hold") { hold = setInterval(() => {}, 1000); send({ type: "held" }); return; }
    phase = "sqlite"; send({ type: "phase", phase });
    const storage = await storageProbe(value.directory);
    phase = "sdk"; send({ type: "phase", phase });
    const sdk = await sdkProbe(value);
    send({ type: "ready", result: { runtime: { electron: process.versions.electron, node: process.versions.node,
      sqlite: process.versions.sqlite, chrome: process.versions.chrome, platform: process.platform, arch: process.arch },
    entryInAsar: __filename.includes(".asar" + path.sep), storage, sdk } });
  } catch {
    send({ type: "failed", code: "COMPAT_" + phase.toUpperCase() + "_FAILED" });
    process.exit(1);
  }
});
