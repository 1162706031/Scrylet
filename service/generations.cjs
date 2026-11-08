const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");
const { validate, validateSubmission, validateEvent, assertReplay, assertTransition, ContractError } = require("../contracts/validate.cjs");
const { publicError } = require("./http.cjs");
const terminal = status => ["completed", "stopped", "failed", "interrupted"].includes(status);
class Generations extends EventEmitter {
  constructor(storage, chats, files, providers, { onFatal = () => {}, stopTimeout = 3500 } = {}) {
    super(); this.storage = storage; this.db = storage.db; this.chats = chats; this.files = files; this.providers = providers;
    this.jobs = new Map(); this.onFatal = onFatal; this.stopTimeout = stopTimeout; this.closing = false;
    for (const row of this.db.prepare("SELECT id FROM generations WHERE status IN ('accepted','requesting','streaming')").all())
      this.finish(row.id, "interrupted", publicError(new ContractError("INTERRUPTED")));
  }
  /** @param {string} id @returns {import('../contracts/index').Generation} */
  get(id) {
    const row = this.db.prepare("SELECT * FROM generations WHERE id=?").get(id);
    if (!row) throw new ContractError("NOT_FOUND", 404);
    return validate("generation", { apiVersion: 1, id: row.id, chatId: row.chat_id, requestId: row.request_id, userMessageId: row.user_message_id,
      assistantMessageId: row.assistant_message_id, status: row.status, lastSeq: row.last_seq, parts: JSON.parse(row.parts), createdAt: row.created_at,
      updatedAt: row.updated_at, error: row.error ? JSON.parse(row.error) : null });
  }
  lookup(deviceId, requestId) {
    const row = this.db.prepare("SELECT * FROM request_receipts WHERE device_id=? AND request_id=?").get(deviceId, requestId);
    if (!row) throw new ContractError("NOT_FOUND", 404);
    const response = JSON.parse(row.response), generation = this.db.prepare("SELECT status FROM generations WHERE id=?").get(row.generation_id);
    return validate("acceptedSubmission", { ...response, ...(generation ? { status: generation.status } : {}), deduplicated: true });
  }
  /** @param {string} chatId @param {string} deviceId @param {unknown} raw
   * @returns {import('../contracts/index').AcceptedSubmission} */
  submit(chatId, deviceId, raw) {
    if (this.closing) throw new ContractError("NOT_READY", 503);
    const input = validate("submitMessage", raw), action = input.action || "append";
    const normalized = { chatId, chatVersion: input.chatVersion, modelId: input.modelId, parentMessageId: input.parentMessageId,
      parts: input.parts, origin: input.origin, command: input.command || null, action, targetMessageId: input.targetMessageId || null, ...(input.regenerationStyle ? { regenerationStyle: input.regenerationStyle } : {}) };
    const identity = validate("requestIdentity", { deviceId, requestId: input.requestId, commandId: input.command?.id || null,
      fingerprint: crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex") });
    const existing = this.db.prepare("SELECT * FROM request_receipts WHERE (device_id=? AND request_id=?) OR (command_id IS NOT NULL AND command_id=?)")
      .get(deviceId, input.requestId, identity.commandId);
    if (existing) {
      assertReplay({ deviceId: existing.device_id, requestId: existing.request_id, commandId: existing.command_id, fingerprint: existing.fingerprint }, identity);
      return this.lookup(deviceId, input.requestId);
    }
    const response = this.storage.transaction(() => {
      const c = this.chats.get(chatId);
      validateSubmission(input, c, new Set(this.db.prepare("SELECT id FROM files").all().map(f => f.id)));
      if (this.chats.active(chatId)) throw new ContractError("VERSION_CONFLICT", 409);
      this.providers.resolve(input.modelId);
      for (const m of this.chats.ancestors(chatId, input.parentMessageId)) for (const part of m.parts) if (part.type === "image") this.files.read(part.fileId);
      let userMessageId = crypto.randomUUID();
      if (action !== "append") {
        const target = c.messages.find(m => m.id === input.targetMessageId);
        if (!target || (action === "edit" ? target.role !== "user" || target.parentMessageId !== input.parentMessageId : target.role !== "assistant" || target.parentMessageId !== input.parentMessageId)) throw new ContractError();
        if (action === "regenerate") {
          const user = c.messages.find(m => m.id === input.parentMessageId);
          if (!user || user.role !== "user") throw new ContractError(); userMessageId = user.id;
        }
      }
      const now = Date.now(), assistantMessageId = crypto.randomUUID(), generationId = crypto.randomUUID();
      if (action !== "regenerate") this.chats.insertMessage({ id: userMessageId, chatId, parentMessageId: input.parentMessageId,
        role: "user", modelId: null, parts: input.parts, createdAt: now, status: null });
      this.chats.insertMessage({ id: assistantMessageId, chatId, parentMessageId: userMessageId, role: "assistant", modelId: input.modelId, parts: [], createdAt: now, status: "accepted" });
      this.db.prepare("UPDATE chats SET current_message_id=?,model_id=?,version=version+1,updated_at=? WHERE id=?").run(assistantMessageId, input.modelId, Math.max(now, c.updatedAt + 1), chatId);
      this.db.prepare("INSERT INTO generations(id,chat_id,device_id,request_id,user_message_id,assistant_message_id,status,last_seq,parts,created_at,updated_at) VALUES(?,?,?,?,?,?,'accepted',0,'[]',?,?)")
        .run(generationId, chatId, deviceId, input.requestId, userMessageId, assistantMessageId, now, now);
      this.record({ apiVersion: 1, chatId, generationId, messageId: assistantMessageId, seq: 1, type: "begin" });
      const accepted = validate("acceptedSubmission", { apiVersion: 1, chatId, generationId, userMessageId, assistantMessageId, status: "accepted", deduplicated: false, chatVersion: c.version + 1 });
      this.db.prepare("INSERT INTO request_receipts VALUES(?,?,?,?,?,?,?)").run(deviceId, input.requestId, identity.commandId, identity.fingerprint, chatId, generationId, JSON.stringify(accepted));
      return accepted;
    });
    const job = { id: response.generationId, modelId: input.modelId, regenerationStyle: input.regenerationStyle, controller: new AbortController(), parts: [], partIds: new Map(), pending: new Map(), lastFlush: 0 };
    this.jobs.set(job.id, job);
    job.promise = new Promise(resolve => setImmediate(resolve)).then(() => this.run(job)).finally(() => { clearTimeout(job.timer); this.jobs.delete(job.id); });
    job.promise.catch(() => this.onFatal(new ContractError("STORAGE_FAILED", 503)));
    return response;
  }
  record(event) {
    const current = this.get(event.generationId); validateEvent(event, current);
    this.db.prepare("INSERT INTO generation_events VALUES(?,?,?)").run(event.generationId, event.seq, JSON.stringify(event));
    this.db.prepare("UPDATE generations SET last_seq=?,updated_at=? WHERE id=?").run(event.seq, Date.now(), event.generationId);
    this.db.prepare("DELETE FROM generation_events WHERE generation_id=? AND seq<=?").run(event.generationId, event.seq - 128);
    return event;
  }
  state(id, to) {
    const g = this.get(id); assertTransition(g.status, to);
    this.db.prepare("UPDATE generations SET status=?,updated_at=? WHERE id=?").run(to, Date.now(), id);
    this.db.prepare("UPDATE messages SET status=? WHERE chat_id=? AND id=?").run(to, g.chatId, g.assistantMessageId);
  }
  context(id, userMessageId, modelId) {
    const current = this.providers.resolve(modelId), messages = [];
    for (const m of this.chats.ancestors(id, userMessageId)) {
      const stored = JSON.parse(this.db.prepare("SELECT provider_output FROM messages WHERE chat_id=? AND id=?").get(id, m.id).provider_output);
      if (m.role === "assistant" && stored?.providerId === current.providerId && stored.apiType === current.row.api_type && Array.isArray(stored.messages)) {
        messages.push(...stored.messages); continue;
      }
      const content = m.parts.map(p => p.type === "image" ? (() => { const file = this.files.read(p.fileId); return { type: "file", data: file.bytes, mediaType: file.value.mime }; })()
        : { type: p.type, text: p.text });
      if (m.role === "system") messages.push({ role: "system", content: content.filter(p => p.type === "text").map(p => p.text).join("\n") });
      else messages.push({ role: m.role, content });
    }
    return messages;
  }
  flush(job) {
    clearTimeout(job.timer); job.timer = null;
    if (!job.pending.size || terminal(this.get(job.id).status)) return;
    const events = this.storage.transaction(() => {
      const g = this.get(job.id); if (g.status === "requesting") this.state(job.id, "streaming");
      const parts = JSON.stringify(job.parts);
      this.db.prepare("UPDATE generations SET parts=? WHERE id=?").run(parts, job.id);
      this.db.prepare("UPDATE messages SET parts=? WHERE chat_id=? AND id=?").run(parts, g.chatId, g.assistantMessageId);
      return [...job.pending].map(([partIndex, text]) => this.record({ apiVersion: 1, chatId: g.chatId, generationId: g.id,
        messageId: g.assistantMessageId, seq: this.get(g.id).lastSeq + 1, type: "delta", partIndex, partType: job.parts[partIndex].type, text }));
    });
    job.pending.clear(); job.lastFlush = Date.now(); for (const e of events) this.emit("event", e);
  }
  async run(job) {
    try {
      if (job.controller.signal.aborted) { this.finish(job.id, job.cancelStatus || "stopped", job.cancelStatus === "interrupted" ? publicError(new ContractError("INTERRUPTED")) : null); return; }
      this.storage.transaction(() => this.state(job.id, "requesting"));
      const g = this.get(job.id), connection = this.providers.resolve(job.modelId);
      const context = this.context(g.chatId, g.userMessageId, job.modelId);
      if (job.regenerationStyle === "detail" || job.regenerationStyle === "concise") context.push({ role: "system", content: job.regenerationStyle === "detail" ? "请为这次回答补充细节和解释。" : "请将这次回答表达得更简洁。" });
      const result = await this.providers.stream(job.modelId, context, job.controller.signal);
      let realFinish = false;
      for await (const part of result.fullStream) {
        if (part.type === "error") throw new ContractError("PROVIDER_ERROR", 502);
        if (part.type === "finish") realFinish = ["stop", "length", "content-filter"].includes(part.finishReason);
        if (part.type !== "text-delta" && part.type !== "reasoning-delta") continue;
        const type = part.type === "text-delta" ? "text" : "reasoning", key = type + ":" + part.id;
        if (!job.partIds.has(key)) { job.partIds.set(key, job.parts.length); job.parts.push({ type, text: "" }); }
        const index = job.partIds.get(key);
        if (job.parts.length > 256 || job.parts[index].text.length + part.text.length > 1000000) throw new ContractError("TOO_LARGE", 413);
        job.parts[index].text += part.text; job.pending.set(index, (job.pending.get(index) || "") + part.text);
        if (Date.now() - job.lastFlush >= 50 || [...job.pending.values()].join("").length >= 256) this.flush(job);
        else if (!job.timer) job.timer = setTimeout(() => {
          try { this.flush(job); } catch { job.storageFailed = true; job.controller.abort(); }
        }, 50);
      }
      this.flush(job);
      if (job.storageFailed) throw new ContractError("STORAGE_FAILED", 503);
      if (job.controller.signal.aborted) this.finish(job.id, job.cancelStatus || "stopped", job.cancelStatus === "interrupted" ? publicError(new ContractError("INTERRUPTED")) : null);
      else if (!realFinish) this.finish(job.id, "failed", publicError(new ContractError("PROVIDER_ERROR")));
      else {
        const response = await result.response;
        this.finish(job.id, "completed", null, JSON.parse(JSON.stringify({ providerId: connection.providerId, apiType: connection.row.api_type, messages: response.messages })));
      }
    } catch (error) {
      job.controller.abort(); this.flush(job);
      const state = job.cancelStatus || "failed";
      this.finish(job.id, state, state === "stopped" ? null : publicError(state === "interrupted" ? new ContractError("INTERRUPTED") : error instanceof ContractError ? error : new ContractError("PROVIDER_ERROR", 502)));
    }
  }
  finish(id, status, error = null, output = null) {
    if (terminal(this.get(id).status)) return;
    const event = this.storage.transaction(() => {
      const g = this.get(id);
      const e = this.record({ apiVersion: 1, chatId: g.chatId, generationId: id, messageId: g.assistantMessageId, seq: g.lastSeq + 1,
        ...(status === "completed" || status === "stopped" ? { type: "finish", status } : { type: status === "interrupted" ? "interrupted" : "error", error }) });
      this.state(id, status);
      validate("storedMessage", { schemaVersion: 1, message: this.chats.get(g.chatId).messages.find(m => m.id === g.assistantMessageId), providerOutput: output, legacy: {} });
      this.db.prepare("UPDATE generations SET error=?,provider_output=? WHERE id=?").run(error ? JSON.stringify(error) : null, JSON.stringify(output), id);
      this.db.prepare("UPDATE messages SET provider_output=? WHERE chat_id=? AND id=?").run(JSON.stringify(output), g.chatId, g.assistantMessageId);
      this.db.prepare("UPDATE chats SET updated_at=MAX(updated_at+1,?) WHERE id=?").run(Date.now(), g.chatId);
      const receipt = this.db.prepare("SELECT response FROM request_receipts WHERE generation_id=?").get(id);
      if (receipt) this.db.prepare("UPDATE request_receipts SET response=? WHERE generation_id=?").run(JSON.stringify({ ...JSON.parse(receipt.response), status }), id);
      return e;
    });
    this.emit("event", event);
  }
  async stop(id) {
    const g = this.get(id), job = this.jobs.get(id);
    if (terminal(g.status)) return g;
    if (job) {
      job.cancelStatus = "stopped"; job.controller.abort(); await this.waitForAbort(job);
    } else this.finish(id, "interrupted", publicError(new ContractError("INTERRUPTED")));
    return this.get(id);
  }
  replay(id, after) {
    const g = this.get(id);
    if (!Number.isSafeInteger(after) || after < 0 || after > g.lastSeq) throw new ContractError();
    const rows = this.db.prepare("SELECT seq,event FROM generation_events WHERE generation_id=? ORDER BY seq").all(id);
    if (!rows.length || after < rows[0].seq - 1) return [validate("event", { apiVersion: 1, type: "snapshot", chatId: g.chatId, generationId: g.id, messageId: g.assistantMessageId, seq: g.lastSeq, snapshot: g })];
    return rows.filter(row => row.seq > after).map(row => validate("event", JSON.parse(row.event)));
  }
  subscribe(id, after, response) {
    const events = this.replay(id, after);
    response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
    const write = e => {
      if (e.generationId !== id) return;
      if (response.writableLength > 1024 * 1024) { response.destroy(); return; }
      response.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      if (e.type === "finish" || e.type === "error" || e.type === "interrupted") response.end();
    };
    for (const e of events) write(e);
    if (terminal(this.get(id).status)) { response.end(); return; }
    const heartbeat = setInterval(() => response.write(": keepalive\n\n"), 15000);
    this.on("event", write);
    response.once("close", () => { clearInterval(heartbeat); this.removeListener("event", write); });
  }
  async close() {
    this.closing = true;
    for (const job of this.jobs.values()) { job.cancelStatus = "interrupted"; job.controller.abort(); }
    await Promise.allSettled([...this.jobs.values()].map(job => this.waitForAbort(job)));
  }
  async waitForAbort(job) {
    let timer;
    try {
      await Promise.race([job.promise, new Promise((_, reject) => { timer = setTimeout(() => {
        const error = new ContractError("INTERRUPTED", 503); this.onFatal(error); reject(error);
      }, this.stopTimeout); })]);
    } finally { clearTimeout(timer); }
  }
}
module.exports = { Generations, terminal };
