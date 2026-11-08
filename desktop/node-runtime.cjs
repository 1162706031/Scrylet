const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");
const path = require("node:path");
const http = require("node:http");
const { endpoint } = require("../contracts/endpoints.cjs");
const { runtimePaths } = require("./runtime-paths.cjs");
const { validate, ContractError } = require("../contracts/validate.cjs");
const { createSecrets } = require("./secrets.cjs");

/** Node implementation of the shared RuntimePort; never restarts a generation. */
class NodeRuntime extends EventEmitter {
  constructor(directory, options = {}) {
    super();
    this.kind = "node"; this.directory = path.resolve(directory); this.options = options;
    this.ready = false; this.error = ""; this.url = null; this.child = null; this.stopping = false;
    this.timers = options.timers || { setTimeout, clearTimeout, setInterval, clearInterval };
    this.now = options.now || Date.now;
    this.secretOperation = options.secretOperation;
    Object.defineProperty(this, "credential", { value: crypto.randomBytes(32).toString("hex"), writable: true });
  }
  async start() {
    if (this.hasStarted || this.child || this.starting) return Promise.reject(new ContractError("VERSION_CONFLICT", 409));
    this.hasStarted = true;
    this.stopping = false; this.error = "";
    const { utilityProcess, safeStorage } = this.options.electron || require("electron");
    const fs = require("node:fs"), migrationFile = path.join(this.directory, "chat-node/v1/migration.json");
    if (fs.existsSync(migrationFile)) {
      require("../contracts/migration.cjs").migrationContract("activation", JSON.parse(fs.readFileSync(migrationFile, "utf8")));
      if (!fs.existsSync(path.join(this.directory, "chat-node/v1/chat.sqlite"))) throw new ContractError("MIGRATION_FAILED", 409);
      this.migration = "validated";
    }
    const legacySource = Object.hasOwn(this.options, "legacySource")
      ? this.options.legacySource
      : process.env.SNAP_MIGRATION_SOURCE;
    if (legacySource) {
      this.migration = "running";
      try {
        this.preparingMigration = require("./migration.cjs").migrateLegacy(legacySource, this.directory, safeStorage, { onProgress: () => { if (this.stopping) throw new ContractError("INTERRUPTED", 503); this.emit("phase", "migrating"); } });
        await this.preparingMigration;
        this.migration = "validated";
      } catch (error) { this.migration = "failed"; throw error; }
      if (this.stopping) throw new ContractError("INTERRUPTED", 503);
    }
    this.secretOperation ||= createSecrets(this.directory, safeStorage);
    const promptSeeds = this.options.bootstrapSources ? require("./connection-seeds.cjs").readPromptSeeds(this.directory, this.options.legacyDirectory) : undefined;
    if (promptSeeds !== undefined) validate("processMessage", { protocolVersion: 1, type: "initialize", dataDirectory: this.directory, legacySource: null, productVersion: "validate", catalogVersion: "validate", credential: this.credential, parentPid: process.pid, testCapabilities: [], promptSeeds });
    const child = this.child = utilityProcess.fork(runtimePaths().service, [], {
      stdio: "pipe", serviceName: "Scrylet Chat Service", env: Object.fromEntries(Object.entries(process.env)
        .filter(([key]) => !/(?:API_KEY|APIKEY|TOKEN|SECRET|PASSWORD|NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)/i.test(key))),
    });
    child.stdout?.resume(); child.stderr?.resume();
    this.starting = new Promise((resolve, reject) => { this.resolveStart = resolve; this.rejectStart = reject; });
    this.startTimer = this.timers.setTimeout(() => this.fail("NOT_READY"), this.options.startTimeout || 12000);
    child.once("spawn", () => {
      if (this.stopping) return;
      this.options.onStartupPhase?.("service-spawned");
      child.postMessage(validate("processMessage", { protocolVersion: 1, type: "initialize", dataDirectory: this.directory,
        legacySource: legacySource || null, productVersion: require("../package.json").version,
        catalogVersion: require("../config/providers.json").verifiedAt, credential: this.credential, parentPid: process.pid, testCapabilities: [], ...(promptSeeds === undefined ? {} : { promptSeeds }) }));
      this.lastPong = this.now();
      this.heartbeat = this.timers.setInterval(() => {
        if (this.now() - this.lastPong > (this.options.heartbeatTimeout || 6000)) return this.fail("INTERRUPTED");
        if (!this.nonce) { this.nonce = crypto.randomUUID(); this.send({ type: "ping", nonce: this.nonce }); }
      }, 1000);
    });
    child.on("message", message => this.onMessage(message));
    child.once("exit", code => {
      this.clearTimers(); this.child = null; this.ready = false; this.url = null;
      if (!this.stopping || code !== 0 || !this.stoppedAcknowledged) this.error = "聊天服务已中断，请重新打开应用";
      this.rejectStart?.(new ContractError("INTERRUPTED", 503)); this.finishStop?.(); this.emit("exit", code);
    });
    return this.starting.then(async () => {
      if (this.options.bootstrapSources) await require("./connection-seeds.cjs").importConnectionSeeds(this, {
        directory: this.directory, legacyDirectory: this.options.legacyDirectory,
      });
      if (this.stopping) throw new ContractError("INTERRUPTED", 503);
      this.ready = true;
      this.options.onStartupPhase?.("service-ready");
    }).catch(error => { this.fail(error.code || "MIGRATION_FAILED"); throw error; })
      .finally(() => { this.starting = null; this.resolveStart = null; this.rejectStart = null; });
  }
  send(message) { this.child?.postMessage(validate("processMessage", { protocolVersion: 1, ...message })); }
  async onMessage(raw) {
    try {
      const message = validate("processMessage", raw);
      if (message.type === "pong") {
        if (message.nonce !== this.nonce) return this.fail("PROTOCOL_MISMATCH");
        this.nonce = null; this.lastPong = this.now();
      } else if (message.type === "phase") { this.options.onStartupPhase?.(message.phase === "starting-http" ? "storage-ready" : message.phase); this.emit("phase", message.phase); }
      else if (message.type === "ready") {
        if (this.stopping || this.transportReady) return this.fail("PROTOCOL_MISMATCH");
        this.url = `http://${message.host}:${message.port}`; this.transportReady = true; this.ready = !this.options.bootstrapSources;
        this.timers.clearTimeout(this.startTimer); this.resolveStart?.();
      } else if (message.type === "failed") this.fail(message.code);
      else if (message.type === "stopped") this.stoppedAcknowledged = true;
      else if (message.type === "secret-request") {
        try {
          const value = await this.secretOperation(message);
          this.send({ type: "secret-response", requestId: message.requestId, ok: true, value });
        } catch { this.send({ type: "secret-response", requestId: message.requestId, ok: false, error: "密钥操作失败", code: "STORAGE_FAILED" }); }
      } else this.fail("PROTOCOL_MISMATCH");
    } catch { this.fail("PROTOCOL_MISMATCH"); }
  }
  fail(code) {
    this.ready = false; this.transportReady = false; this.error = "聊天服务无法使用，请查看本机数据与运行环境";
    this.rejectStart?.(new ContractError(code, 503)); this.child?.kill(); this.clearTimers();
  }
  clearTimers() { this.timers.clearTimeout(this.startTimer); this.timers.clearInterval(this.heartbeat); }
  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.ready = false; this.stopping = true; this.clearTimers();
    if (this.preparingMigration) { try { await this.preparingMigration; } catch {} }
    if (!this.child) return;
    this.stopPromise = new Promise((resolve, reject) => {
      let hardTimer;
      const timeout = this.timers.setTimeout(() => {
        this.child?.kill(); hardTimer = this.timers.setTimeout(() => {
          this.error = "聊天服务退出尚未确认"; reject(new ContractError("INTERRUPTED", 503));
        }, 1500);
      }, this.options.stopTimeout || 5000);
      this.finishStop = () => { this.timers.clearTimeout(timeout); this.timers.clearTimeout(hardTimer); resolve(); };
      try { this.send({ type: "shutdown" }); } catch { this.child?.kill(); }
    });
    await this.stopPromise;
  }
  async request(route, options = {}) {
    if ((!this.ready && !this.transportReady) || !this.url || this.stopping) throw new ContractError("NOT_READY", 503);
    if (!route.startsWith("/snap/api/") || route.includes("\\") || route.includes("#") || /[\r\n]/.test(route)) throw new ContractError();
    const response = await fetch(this.url + route, { method: options.method || "GET", headers: { authorization: "Bearer " + this.credential, "content-type": "application/json" },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal: AbortSignal.timeout(15000), redirect: "error" });
    const result = await response.json();
    if (!response.ok) throw new ContractError(validate("publicError", result).code, response.status);
    return result;
  }
  async providers() { return validate("providerCatalog", await this.request("/snap/api/providers")); }
  async saveProvider(id, data) {
    if (data?.apiVersion === undefined) {
      const legacy = validate("legacyProviderChange", data);
      const current = (await this.providers()).providers.find(p => p.id === id);
      if (!current) throw new ContractError("NOT_FOUND", 404);
      data = { apiVersion: 1, providerId: id, revision: current.revision, baseUrl: legacy.baseUrl || current.baseUrl,
        apiType: current.apiType, modelIds: current.models, keyAction: legacy.remove ? "delete" : legacy.apiKey.trim() ? "set" : "keep",
        ...(legacy.remove || !legacy.apiKey.trim() ? {} : { apiKey: legacy.apiKey.trim() }) };
    }
    return this.request("/snap/api/providers/" + encodeURIComponent(id), { method: "POST", body: data });
  }
  async availableModels() {
    const models = await this.request("/snap/api/models");
    if (!Array.isArray(models)) throw new ContractError("PROTOCOL_MISMATCH", 503);
    return models.map(model => validate("publicModel", model)).some(m => m.configured);
  }
  proxy(request, response, deviceId, jsonBody) {
    if (!this.ready || !this.url) throw new ContractError("NOT_READY", 503);
    const url = new URL(request.originalUrl || request.url, this.url);
    if (url.origin !== this.url || !endpoint(request.method, url.pathname) || !/^[A-Za-z0-9_-]{1,160}$/.test(deviceId)) throw new ContractError("NOT_FOUND", 404);
    const body = jsonBody === undefined ? null : Buffer.from(JSON.stringify(jsonBody));
    const headers = { authorization: "Bearer " + this.credential, "x-scrylet-device": deviceId };
    if (request.headers["content-type"]) headers["content-type"] = request.headers["content-type"];
    if (body) { headers["content-type"] = "application/json"; headers["content-length"] = String(body.length); }
    else if (request.headers["content-length"]) headers["content-length"] = request.headers["content-length"];
    const upstream = http.request(url, { method: request.method, headers }, incoming => {
      const exposed = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
      for (const name of ["content-type", "content-length", "content-disposition", "content-security-policy", "x-accel-buffering"]) if (incoming.headers[name]) exposed[name] = incoming.headers[name];
      response.writeHead(incoming.statusCode, exposed); incoming.pipe(response); incoming.on("error", () => response.destroy());
    });
    if (!url.pathname.endsWith("/events")) upstream.setTimeout(30000, () => upstream.destroy());
    upstream.on("error", () => {
      if (response.destroyed) return;
      if (response.headersSent) response.destroy();
      else response.status(503).json({ error: "聊天服务暂时不可用", code: "NOT_READY" });
    });
    request.once("aborted", () => upstream.destroy());
    response.once("close", () => { if (!response.writableEnded) upstream.destroy(); });
    if (body) upstream.end(body); else request.pipe(upstream);
  }
}
module.exports = { NodeRuntime };
