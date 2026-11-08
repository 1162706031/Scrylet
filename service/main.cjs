const { validate, ContractError } = require("../contracts/validate.cjs");
const { Storage } = require("./storage.cjs");
const { createHttp, json, publicError } = require("./http.cjs");
const { SecretChannel } = require("./secrets.cjs");
let initialized = false, storage, server, generations, stopping = false, lastPing = Date.now(), watchdog;
const send = value => process.parentPort.postMessage(validate("processMessage", { protocolVersion: 1, ...value }));
const secrets = new SecretChannel(send);
async function stop(code = 0) {
  if (stopping) return;
  stopping = true; clearInterval(watchdog); clearTimeout(initTimer);
  try {
    await generations?.close(); secrets.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    storage?.close();
    if (code === 0) send({ type: "stopped" });
    await new Promise(setImmediate);
  } finally { process.exit(code); }
}
const initTimer = setTimeout(() => stop(1), 10000);
process.parentPort.on("message", async ({ data: raw }) => {
  try {
    const message = validate("processMessage", raw);
    if (message.type === "secret-response") { secrets.receive(message); return; }
    if (message.type === "ping") { lastPing = Date.now(); send({ type: "pong", nonce: message.nonce }); return; }
    if (message.type === "shutdown") { await stop(); return; }
    if (message.type !== "initialize" || initialized || message.testCapabilities.length) throw new ContractError("PROTOCOL_MISMATCH");
    initialized = true; clearTimeout(initTimer);
    watchdog = setInterval(() => {
      let alive = true; try { process.kill(message.parentPid, 0); } catch { alive = false; }
      if (!alive || Date.now() - lastPing > 6000) stop(1);
    }, 250);
    send({ type: "phase", phase: "opening-storage", completed: 0, total: 1 });
    storage = new Storage(message.dataDirectory);
    if (message.legacySource || require("node:fs").existsSync(require("node:path").join(storage.root, "migration-ready.json"))) {
      const fs = require("node:fs"), path = require("node:path");
      const activation = require("../contracts/migration.cjs").migrationContract("activation", JSON.parse(fs.readFileSync(path.join(storage.root, "migration.json"), "utf8")));
      const marker = JSON.parse(storage.db.prepare("SELECT value FROM product_state WHERE key='legacy-migration'").get()?.value || "null");
      if (!marker || marker.sourceIdentity !== activation.sourceIdentity || marker.snapshotHash !== activation.snapshotHash) throw new ContractError("MIGRATION_FAILED", 409);
    }
    const { Prompts } = require("./prompts.cjs"), { Files } = require("./files.cjs"), { Chats } = require("./chats.cjs");
    const prompts = new Prompts(storage); prompts.seed(message.promptSeeds); const files = new Files(storage), chats = new Chats(storage, files);
    const { Providers } = require("./providers.cjs");
    const providers = new Providers(storage, value => secrets.request(value)); await providers.flushDeletes();
    send({ type: "phase", phase: "starting-http", completed: 0, total: 1 });
    const { Generations } = require("./generations.cjs");
    generations = new Generations(storage, chats, files, providers, { onFatal: error => { send({ type: "failed", ...publicError(error) }); stop(1); } });
    const route = require("./routes.cjs").createRoutes({ chats, files, prompts, providers, generations });
    server = await createHttp({ credential: message.credential, route: (req, res, url) => {
      if (stopping) throw new ContractError("NOT_READY", 503); return route(req, res, url);
    } });
    send({ type: "ready", host: "127.0.0.1", port: server.address().port, schemaVersion: storage.schemaVersion, apiVersion: 1 });
  } catch (error) { send({ type: "failed", ...publicError(error) }); await stop(1); }
});
