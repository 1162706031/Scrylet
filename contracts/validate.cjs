// Node-only boundaries and relational validation; public wire schemas are shared.
const { z } = require("zod");
const path = require("node:path");
const { schemas: publicSchemas, id, count, object, publicError, code, status, terminal } = require("./public.cjs");
const absolutePath = z.string().min(1).max(32768).refine(v => !v.includes("\0") && (path.posix.isAbsolute(v) || path.win32.isAbsolute(v)));
const processBase = { protocolVersion: z.literal(1) };
const promptSeeds = z.record(z.string().min(1).max(154), object({ name: z.string().min(1).max(256), content: z.string().max(1000000) })).refine(value => Object.keys(value).length <= 256 && JSON.stringify(value).length <= 1000000);
const processMessage = z.discriminatedUnion("type", [
  object({ ...processBase, type: z.literal("initialize"), dataDirectory: absolutePath, legacySource: absolutePath.nullable(),
    productVersion: z.string().min(1).max(80), catalogVersion: z.string().min(1).max(80), credential: z.string().min(32).max(256),
    parentPid: count.min(1), promptSeeds: promptSeeds.optional(), testCapabilities: z.array(z.enum(["mock-provider", "fault-injection"])).max(2) }),
  object({ ...processBase, type: z.literal("shutdown") }),
  object({ ...processBase, type: z.literal("ping"), nonce: id }),
  object({ ...processBase, type: z.literal("pong"), nonce: id }),
  object({ ...processBase, type: z.literal("phase"), phase: z.enum(["opening-storage", "migrating", "starting-http"]), completed: count, total: count }).refine(v => v.completed <= v.total),
  object({ ...processBase, type: z.literal("ready"), host: z.literal("127.0.0.1"), port: count.min(1).max(65535), schemaVersion: count.min(1), apiVersion: z.literal(1) }),
  object({ ...processBase, type: z.literal("failed"), ...publicError.shape }),
  object({ ...processBase, type: z.literal("stopped") }),
  object({ ...processBase, type: z.literal("secret-request"), requestId: id, operation: z.enum(["get", "set", "delete"]), providerId: id, secretRef: id.optional(), value: z.string().max(4096).optional() })
    .refine(v => (v.operation === "set") === (v.value !== undefined) && (v.value === undefined || v.value.trim().length > 0)),
  object({ ...processBase, type: z.literal("secret-response"), requestId: id, ok: z.boolean(), value: z.string().max(4096).nullable().optional(),
    error: publicError.shape.error.optional(), code: code.optional() })
    .refine(v => v.ok ? v.value !== undefined && v.error === undefined && v.code === undefined : v.value === undefined && v.error !== undefined && v.code !== undefined),
]);
const nativeEvent = z.discriminatedUnion("type", [
  object({ ...processBase, type: z.literal("ready"), coordinateSpace: z.literal("physical") }),
  ...["down", "move", "up"].map(type => object({ ...processBase, type: z.literal(type), x: z.number().int().min(-2147483648).max(2147483647), y: z.number().int().min(-2147483648).max(2147483647) })),
  object({ ...processBase, type: z.literal("cancel") }),
]);
const schemas = { ...publicSchemas, nativeEvent, processMessage };
class ContractError extends Error {
  constructor(code = "INVALID_CONTRACT", status = 400) { super(code); this.name = "ContractError"; this.code = code; this.status = status; }
}
function validate(kind, value) {
  if (!Object.hasOwn(schemas, kind)) throw new ContractError();
  const result = schemas[kind].safeParse(value);
  if (!result.success) throw new ContractError();
  return result.data;
}
function validateGraph(value) {
  const c = validate("chat", value), nodes = new Map(c.messages.map(m => [m.id, m]));
  if (nodes.size !== c.messages.length || (c.currentMessageId !== null && !nodes.has(c.currentMessageId))) throw new ContractError();
  const visited = new Set();
  for (const m of c.messages) {
    if (m.chatId !== c.id || (m.parentMessageId !== null && !nodes.has(m.parentMessageId))) throw new ContractError();
    const chain = new Set(); let node = m;
    while (node && !visited.has(node.id)) {
      if (chain.has(node.id)) throw new ContractError();
      chain.add(node.id); node = nodes.get(node.parentMessageId);
    }
    for (const id of chain) visited.add(id);
  }
  return c;
}
function assertTransition(from, to) {
  const next = { accepted: ["requesting", "stopped", "failed", "interrupted"], requesting: ["streaming", "completed", "stopped", "failed", "interrupted"], streaming: ["completed", "stopped", "failed", "interrupted"] };
  if (!status.safeParse(from).success || !status.safeParse(to).success || !next[from]?.includes(to)) throw new ContractError("VERSION_CONFLICT", 409);
}
function validateEvent(value, previous) {
  const e = validate("event", value), g = validate("generation", previous);
  if (e.chatId !== g.chatId || e.generationId !== g.id || e.messageId !== g.assistantMessageId || e.seq !== g.lastSeq + 1 || terminal.has(g.status)) throw new ContractError("VERSION_CONFLICT", 409);
  if (e.type === "begin" && (g.status !== "accepted" || g.lastSeq !== 0)) throw new ContractError("VERSION_CONFLICT", 409);
  if (e.type === "delta" && !["requesting", "streaming"].includes(g.status)) throw new ContractError("VERSION_CONFLICT", 409);
  if (e.type === "snapshot" && (e.snapshot.id !== g.id || e.snapshot.chatId !== g.chatId || e.snapshot.assistantMessageId !== g.assistantMessageId || e.snapshot.lastSeq !== e.seq)) throw new ContractError();
  if (e.type === "snapshot" && e.snapshot.status !== g.status) assertTransition(g.status, e.snapshot.status);
  if (e.type === "finish") assertTransition(g.status, e.status);
  if (e.type === "error") assertTransition(g.status, "failed");
  if (e.type === "interrupted") assertTransition(g.status, "interrupted");
  return e;
}
function validateRecovery(value, previous) {
  const event = validate("event", value), g = validate("generation", previous), snapshot = event.snapshot;
  const rank = { accepted: 0, requesting: 1, streaming: 2, completed: 3, stopped: 3, failed: 3, interrupted: 3 };
  if (event.type !== "snapshot" || event.chatId !== g.chatId || event.generationId !== g.id || event.messageId !== g.assistantMessageId ||
      snapshot.id !== g.id || snapshot.chatId !== g.chatId || snapshot.requestId !== g.requestId || snapshot.userMessageId !== g.userMessageId ||
      snapshot.assistantMessageId !== g.assistantMessageId || snapshot.createdAt !== g.createdAt || event.seq !== snapshot.lastSeq || event.seq < g.lastSeq ||
      rank[snapshot.status] < rank[g.status] || (terminal.has(g.status) && (snapshot.status !== g.status || event.seq !== g.lastSeq))) throw new ContractError("VERSION_CONFLICT", 409);
  return snapshot;
}
function validateSubmission(value, chatValue, files) {
  const input = validate("submitMessage", value), c = validateGraph(chatValue);
  if (input.chatVersion !== c.version) throw new ContractError("VERSION_CONFLICT", 409);
  if (input.parentMessageId !== null && !c.messages.some(m => m.id === input.parentMessageId)) throw new ContractError();
  for (const p of input.parts) if (p.type === "image" && !files.has(p.fileId)) throw new ContractError("NOT_FOUND", 404);
  return input;
}
function assertRevision(expected, current) {
  if (!count.safeParse(expected).success || !count.safeParse(current).success || expected !== current) throw new ContractError("DRAFT_CONFLICT", 409);
}
function assertReplay(existing, incoming) {
  // Fingerprints are computed over canonical normalized content by storage, never supplied by a browser.
  existing = validate("requestIdentity", existing); incoming = validate("requestIdentity", incoming);
  if (existing.deviceId !== incoming.deviceId || existing.requestId !== incoming.requestId || existing.fingerprint !== incoming.fingerprint || existing.commandId !== incoming.commandId) throw new ContractError("REQUEST_CONFLICT", 409);
}
function parseNativeLine(line) {
  if (typeof line !== "string" || Buffer.byteLength(line) > 1024 || !line.endsWith("\n") || line.slice(0, -1).includes("\n")) throw new ContractError("PROTOCOL_MISMATCH");
  let value; try { value = JSON.parse(line); } catch { throw new ContractError("PROTOCOL_MISMATCH"); }
  return validate("nativeEvent", value);
}
module.exports = { schemas, validate, validateGraph, validateEvent, validateRecovery, validateSubmission, assertTransition, assertRevision, assertReplay, parseNativeLine, ContractError };
