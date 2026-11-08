const crypto = require("node:crypto");
const { validate, validateGraph, assertRevision, ContractError } = require("../contracts/validate.cjs");
const parse = JSON.parse;
class Chats {
  constructor(storage, files) { this.storage = storage; this.db = storage.db; this.files = files; }
  /** @param {unknown} value @returns {import('../contracts/index').Chat} */
  create(value) {
    const v = validate("createChat", value), id = crypto.randomUUID(), now = Date.now();
    this.db.prepare("INSERT INTO chats(id,title,model_id,created_at,updated_at) VALUES(?,?,?,?,?)").run(id, v.title || "新对话", v.modelId, now, now);
    return this.get(id);
  }
  /** @param {string} id @returns {import('../contracts/index').Chat} */
  get(id) {
    const row = this.db.prepare("SELECT * FROM chats WHERE id=?").get(id);
    if (!row) throw new ContractError("NOT_FOUND", 404);
    const messages = this.db.prepare("SELECT * FROM messages WHERE chat_id=? ORDER BY ordinal").all(id).map(m => validate("message", {
      id: m.id, chatId: m.chat_id, parentMessageId: m.parent_id, role: m.role, modelId: m.model_id,
      parts: parse(m.parts), createdAt: m.created_at, status: m.status,
    }));
    return validateGraph({ apiVersion: 1, id: row.id, title: row.title, version: row.version, currentMessageId: row.current_message_id,
      modelId: row.model_id, pinned: Boolean(row.pinned), archived: Boolean(row.archived), lastReadAt: row.last_read_at,
      createdAt: row.created_at, updatedAt: row.updated_at, messages });
  }
  list({ limit = 30, cursor = null, search = "", archived = false, pinned = null, unread = false } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof search !== "string" || search.length > 1000) throw new ContractError();
    const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
    const rows = this.db.prepare(`SELECT id,updated_at FROM chats WHERE archived=? AND (? IS NULL OR pinned=?)
      AND (?=0 OR (updated_at>COALESCE(last_read_at,0) AND NOT EXISTS(SELECT 1 FROM generations g WHERE g.chat_id=chats.id AND g.status IN ('accepted','requesting','streaming'))))
      AND (title LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM messages m WHERE m.chat_id=chats.id AND m.parts LIKE ? ESCAPE '\\')) ORDER BY pinned DESC,updated_at DESC,id`).all(
      Number(archived), pinned === null ? null : Number(pinned), pinned === null ? null : Number(pinned), Number(unread), pattern, pattern);
    const start = cursor === null ? 0 : rows.findIndex(r => r.id === cursor) + 1;
    if (cursor !== null && start === 0) throw new ContractError("VERSION_CONFLICT", 409);
    const selected = rows.slice(start, start + limit);
    return { apiVersion: 1, items: selected.map(r => this.get(r.id)), nextCursor: rows.length > start + limit ? selected.at(-1).id : null };
  }
  active(id) { return this.db.prepare("SELECT 1 FROM generations WHERE chat_id=? AND status IN ('accepted','requesting','streaming')").get(id); }
  /** @param {string} id @param {unknown} value @returns {import('../contracts/index').Chat} */
  patch(id, value) {
    const v = validate("chatPatch", value);
    return this.storage.transaction(() => {
      const old = this.get(id); if (v.version !== old.version || (this.active(id) && (Object.hasOwn(v, "currentMessageId") || Object.hasOwn(v, "modelId")))) throw new ContractError("VERSION_CONFLICT", 409);
      const next = validateGraph({ ...old, ...Object.fromEntries(Object.entries(v).filter(([k]) => !["apiVersion", "version"].includes(k))), version: old.version + 1,
        updatedAt: Object.keys(v).every(k => ["apiVersion", "version", "lastReadAt"].includes(k)) ? old.updatedAt : Math.max(Date.now(), old.updatedAt + 1) });
      this.db.prepare("UPDATE chats SET title=?,version=?,current_message_id=?,model_id=?,pinned=?,archived=?,last_read_at=?,updated_at=? WHERE id=?")
        .run(next.title, next.version, next.currentMessageId, next.modelId, Number(next.pinned), Number(next.archived), next.lastReadAt, next.updatedAt, id);
      return next;
    });
  }
  insertMessage(value, { providerOutput = null, legacy = {} } = {}) {
    const m = validate("message", value);
    validate("storedMessage", { schemaVersion: 1, message: m, providerOutput, legacy });
    for (const p of m.parts) if (p.type === "image") this.files.read(p.fileId);
    const ordinal = this.db.prepare("SELECT COALESCE(MAX(ordinal),0)+1 AS n FROM messages WHERE chat_id=?").get(m.chatId).n;
    this.db.prepare("INSERT INTO messages(chat_id,id,parent_id,role,model_id,parts,status,created_at,provider_output,legacy,ordinal) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(m.chatId, m.id, m.parentMessageId, m.role, m.modelId, JSON.stringify(m.parts), m.status, m.createdAt, JSON.stringify(providerOutput), JSON.stringify(legacy), ordinal);
    m.parts.forEach((p, ordinal) => { if (p.type === "image") this.db.prepare("INSERT INTO message_files VALUES(?,?,?,?)").run(m.chatId, m.id, ordinal, p.fileId); });
  }
  importGraph(value, { sourceId, sourceHash, raw = {} } = {}) {
    const c = validateGraph(value);
    if (typeof sourceId !== "string" || !sourceId.length || !/^[a-f0-9]{64}$/.test(sourceHash || "")) throw new ContractError();
    validate("storedMessage", { schemaVersion: 1, message: c.messages[0] || { id: "empty", chatId: c.id, parentMessageId: null, role: "system", modelId: null, parts: [], createdAt: c.createdAt, status: null }, providerOutput: null, legacy: raw });
    return this.storage.transaction(() => {
      const existing = this.db.prepare("SELECT target_id,source_hash FROM legacy_ids WHERE kind='chat' AND source_id=?").get(sourceId);
      if (existing) { if (existing.source_hash !== sourceHash) throw new ContractError("VERSION_CONFLICT", 409); return this.get(existing.target_id); }
      this.db.prepare("INSERT INTO chats(id,legacy_id,title,version,current_message_id,model_id,pinned,archived,last_read_at,created_at,updated_at,legacy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(c.id, sourceId, c.title, c.version, c.currentMessageId, c.modelId, Number(c.pinned), Number(c.archived), c.lastReadAt, c.createdAt, c.updatedAt, JSON.stringify(raw));
      for (const m of c.messages) this.insertMessage(m);
      this.db.prepare("INSERT INTO legacy_ids VALUES('chat',?,?,?)").run(sourceId, c.id, sourceHash);
      return this.get(c.id);
    });
  }
  ancestors(id, messageId) {
    const c = this.get(id), nodes = new Map(c.messages.map(m => [m.id, m])); const chain = [];
    if (messageId !== null && !nodes.has(messageId)) throw new ContractError("NOT_FOUND", 404);
    for (let node = nodes.get(messageId); node; node = nodes.get(node.parentMessageId)) chain.push(node);
    return chain.reverse();
  }
  delete(id, expectedVersion) {
    this.storage.transaction(() => { const c = this.get(id); if (c.version !== expectedVersion || this.active(id)) throw new ContractError("VERSION_CONFLICT", 409);
      this.db.prepare("DELETE FROM chats WHERE id=?").run(id); });
    return { success: true };
  }
  deleteMessage(id, messageId, expectedVersion) {
    return this.storage.transaction(() => {
      const c = this.get(id); if (c.version !== expectedVersion || this.active(id)) throw new ContractError("VERSION_CONFLICT", 409);
      const target = c.messages.find(m => m.id === messageId); if (!target) throw new ContractError("NOT_FOUND", 404);
      // Match pinned ChatTable.delete_message_from_history: remove the selected
      // node AND its immediate children, reparent grandchildren, select last leaf.
      const children = c.messages.filter(m => m.parentMessageId === messageId), deleted = new Set([messageId, ...children.map(m => m.id)]);
      const remaining = c.messages.filter(m => !deleted.has(m.id)).map(m => children.some(ch => ch.id === m.parentMessageId) ? { ...m, parentMessageId: target.parentMessageId } : m);
      for (const m of remaining) this.db.prepare("UPDATE messages SET parent_id=? WHERE chat_id=? AND id=?").run(m.parentMessageId, id, m.id);
      if (target.parentMessageId !== null) {
        let ordinal = this.db.prepare("SELECT MAX(ordinal) n FROM messages WHERE chat_id=?").get(id).n;
        const grandchildren = children.flatMap(ch => c.messages.filter(m => m.parentMessageId === ch.id));
        for (const m of grandchildren) this.db.prepare("UPDATE messages SET ordinal=? WHERE chat_id=? AND id=?").run(++ordinal, id, m.id);
        const order = this.db.prepare("SELECT id FROM messages WHERE chat_id=? ORDER BY ordinal").all(id).map(m => m.id);
        remaining.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      }
      let current = target.parentMessageId;
      for (;;) { const next = remaining.filter(m => m.parentMessageId === current).at(-1); if (!next) break; current = next.id; }
      this.db.prepare("UPDATE chats SET current_message_id=?,version=version+1,updated_at=? WHERE id=?").run(current, Date.now(), id);
      for (const removed of deleted) this.db.prepare("DELETE FROM messages WHERE chat_id=? AND id=?").run(id, removed);
      for (const removed of deleted) this.db.prepare("DELETE FROM generations WHERE chat_id=? AND (user_message_id=? OR assistant_message_id=?)").run(id, removed, removed);
      return this.get(id);
    });
  }
  clone(id) {
    const c = this.get(id), copyId = crypto.randomUUID();
    return this.storage.transaction(() => {
      const legacy = parse(this.db.prepare("SELECT legacy FROM chats WHERE id=?").get(id).legacy);
      this.db.prepare("INSERT INTO chats(id,title,model_id,pinned,created_at,updated_at,legacy) VALUES(?,?,?,?,?,?,?)").run(copyId, "Clone of " + c.title, c.modelId, Number(c.pinned), Date.now(), Date.now(), JSON.stringify({ ...legacy, originalChatId: id, branchPointMessageId: c.currentMessageId }));
      for (const m of c.messages) {
        const row = this.db.prepare("SELECT provider_output,legacy FROM messages WHERE chat_id=? AND id=?").get(id, m.id);
        this.insertMessage({ ...m, chatId: copyId, status: ["accepted", "requesting", "streaming"].includes(m.status) ? "interrupted" : m.status }, { providerOutput: parse(row.provider_output), legacy: parse(row.legacy) });
      }
      this.db.prepare("UPDATE chats SET current_message_id=? WHERE id=?").run(c.currentMessageId, copyId);
      return this.get(copyId);
    });
  }
  markAllRead() { this.db.prepare("UPDATE chats SET last_read_at=MAX(updated_at,?),version=version+1").run(Date.now()); return { success: true }; }
  editMessage(id, messageId, value) {
    const v = validate("messagePatch", value);
    return this.storage.transaction(() => {
      const c = this.get(id), m = c.messages.find(item => item.id === messageId);
      if (c.version !== v.version || this.active(id)) throw new ContractError("VERSION_CONFLICT", 409);
      if (!m || m.role === "system") throw new ContractError("NOT_FOUND", 404);
      if (m.role === "user" && (v.parts.some(p => p.type === "reasoning") || v.parts.filter(p => p.type === "image").length > 12)) throw new ContractError();
      for (const p of v.parts) if (p.type === "image") this.files.read(p.fileId);
      // Save-only edits keep the node and children. Subsequent context must use
      // the edited content instead of the original cached provider output.
      this.db.prepare("UPDATE messages SET parts=?,provider_output='null' WHERE chat_id=? AND id=?").run(JSON.stringify(v.parts), id, messageId);
      const generations = this.db.prepare("SELECT id FROM generations WHERE chat_id=? AND assistant_message_id=?").all(id, messageId);
      for (const generation of generations) {
        this.db.prepare("UPDATE generations SET parts=?,provider_output='null' WHERE id=?").run(JSON.stringify(v.parts), generation.id);
        this.db.prepare("DELETE FROM generation_events WHERE generation_id=?").run(generation.id);
      }
      this.db.prepare("DELETE FROM message_files WHERE chat_id=? AND message_id=?").run(id, messageId);
      v.parts.forEach((p, ordinal) => { if (p.type === "image") this.db.prepare("INSERT INTO message_files VALUES(?,?,?,?)").run(id, messageId, ordinal, p.fileId); });
      this.db.prepare("UPDATE chats SET version=version+1,updated_at=MAX(updated_at+1,?) WHERE id=?").run(Date.now(), id);
      return this.get(id);
    });
  }
  readDraft(deviceId, browserClientId, chatKey) {
    validate("draftWrite", { apiVersion: 1, browserClientId, expectedRevision: 0, modelId: "lookup", parts: [] });
    const row = this.db.prepare("SELECT * FROM draft_snapshots WHERE device_id=? AND browser_id=? AND chat_key=?").get(deviceId, browserClientId, chatKey);
    if (!row) throw new ContractError("NOT_FOUND", 404);
    return validate("draft", { apiVersion: 1, browserClientId, chatKey, revision: row.revision, modelId: row.model_id, parts: parse(row.parts), savedAt: row.saved_at });
  }
  /** Authenticated device identity comes from the gateway, never the body.
   * @param {string} deviceId @param {string} chatKey @param {unknown} value
   * @returns {import('../contracts/index').DraftSnapshot} */
  writeDraft(deviceId, chatKey, value) {
    const v = validate("draftWrite", value);
    validate("draft", { apiVersion: 1, browserClientId: v.browserClientId, chatKey, revision: 0, modelId: v.modelId, parts: v.parts, savedAt: Date.now() });
    return this.storage.transaction(() => {
      const current = this.db.prepare("SELECT revision FROM draft_snapshots WHERE device_id=? AND browser_id=? AND chat_key=?").get(deviceId, v.browserClientId, chatKey);
      assertRevision(v.expectedRevision, current?.revision || 0);
      for (const p of v.parts) if (p.type === "image") this.files.read(p.fileId);
      this.db.prepare("INSERT INTO draft_snapshots(device_id,browser_id,chat_key,revision,model_id,parts,saved_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(device_id,browser_id,chat_key) DO UPDATE SET revision=excluded.revision,model_id=excluded.model_id,parts=excluded.parts,saved_at=excluded.saved_at")
        .run(deviceId, v.browserClientId, chatKey, v.expectedRevision + 1, v.modelId, JSON.stringify(v.parts), Date.now());
      this.db.prepare("DELETE FROM draft_files WHERE device_id=? AND browser_id=? AND chat_key=?").run(deviceId, v.browserClientId, chatKey);
      v.parts.forEach((p, ordinal) => { if (p.type === "image") this.db.prepare("INSERT INTO draft_files VALUES(?,?,?,?,?)").run(deviceId, v.browserClientId, chatKey, ordinal, p.fileId); });
      return this.readDraft(deviceId, v.browserClientId, chatKey);
    });
  }
}
module.exports = { Chats };
