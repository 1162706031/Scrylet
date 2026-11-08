// Shared browser/service wire schemas. No Node builtins or process capabilities.
const { z } = require("zod");
const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const modelId = z.string().min(1).max(256).refine(s => !/[\x00-\x1f]/.test(s));
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const timestamp = count; // epoch milliseconds; conversion belongs to the migration adapter
const text = z.string().max(1_000_000);
const object = shape => z.strictObject(shape);
const nullableId = id.nullable();
const status = z.enum(["accepted", "requesting", "streaming", "completed", "stopped", "failed", "interrupted"]);
const terminal = new Set(["completed", "stopped", "failed", "interrupted"]);
const inputPart = z.discriminatedUnion("type", [object({ type: z.literal("text"), text }), object({ type: z.literal("image"), fileId: id })]);
const part = z.union([inputPart, object({ type: z.literal("reasoning"), text })]);
const parts = z.array(inputPart).max(128).refine(v => v.filter(p => p.type === "image").length <= 12);
const command = object({ id, clientId: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/), context: z.string().max(400) });
const baseUrl = z.string().max(2048).refine(value => {
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && !u.search && !u.hash; }
  catch { return false; }
});
const code = z.enum(["INVALID_CONTRACT", "VERSION_CONFLICT", "REQUEST_CONFLICT", "DRAFT_CONFLICT", "UNAUTHORIZED", "FORBIDDEN", "PAUSED", "NOT_READY", "TOO_LARGE", "NOT_FOUND", "PROVIDER_ERROR", "INTERRUPTED", "STORAGE_FAILED", "MIGRATION_FAILED", "PROTOCOL_MISMATCH"]);
const publicError = object({ error: z.string().min(1).max(240), code });
const message = object({ id, chatId: id, parentMessageId: nullableId, role: z.enum(["system", "user", "assistant"]),
  modelId: modelId.nullable(), parts: z.array(part).max(256), createdAt: timestamp, status: status.nullable() });
const chat = object({ apiVersion: z.literal(1), id, title: z.string().max(4096), version: count,
  currentMessageId: nullableId, modelId, pinned: z.boolean(), archived: z.boolean(), lastReadAt: timestamp.nullable(),
  createdAt: timestamp, updatedAt: timestamp, messages: z.array(message).max(100000), activeGeneration: z.lazy(() => generation).nullable().optional() });
const generation = object({ apiVersion: z.literal(1), id, chatId: id, requestId: id, userMessageId: id, assistantMessageId: id,
  status, lastSeq: count, parts: z.array(part).max(256), createdAt: timestamp, updatedAt: timestamp, error: publicError.nullable() })
  .refine(g => (g.status === "failed" || g.status === "interrupted") === (g.error !== null));
const eventBase = { apiVersion: z.literal(1), chatId: id, generationId: id, messageId: id, seq: count.min(1) };
const event = z.discriminatedUnion("type", [
  object({ ...eventBase, type: z.literal("begin") }),
  object({ ...eventBase, type: z.literal("delta"), partIndex: count.max(255), partType: z.enum(["text", "reasoning"]), text }),
  object({ ...eventBase, type: z.literal("snapshot"), snapshot: generation }),
  object({ ...eventBase, type: z.literal("finish"), status: z.enum(["completed", "stopped"]) }),
  object({ ...eventBase, type: z.enum(["error", "interrupted"]), error: publicError }),
]);
const draft = object({ apiVersion: z.literal(1), browserClientId: id, chatKey: id, revision: count, modelId,
  parts, savedAt: timestamp });
const file = object({ apiVersion: z.literal(1), id, name: z.string().min(1).max(255), mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]),
  bytes: count.min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), width: count.min(1), height: count.min(1), createdAt: timestamp });
function isJson(value) {
  const seen = new Set(), queue = [[value, 0]]; let nodes = 0;
  while (queue.length) {
    const [v, depth] = queue.pop();
    if (++nodes > 100000 || depth > 64) return false;
    if (v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) continue;
    if (typeof v !== "object" || seen.has(v) || (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)) return false;
    seen.add(v); for (const item of Object.values(v)) queue.push([item, depth + 1]);
  }
  return true;
}
const legacyPayload = z.custom(isJson); // local JSON only; never spread into requests or executable options
const desktopDelivery = object({ id, image: z.string().startsWith("data:image/").max(32 * 1024 * 1024), prompt: z.string().min(1).max(1000000), showCaptureHints: z.literal(false) });
const schemas = {
  captureRequest: object({ displayId: z.string().max(160) }),
  capture: object({ displayId: z.string().min(1).max(160), width: count.min(1), height: count.min(1), image: z.string().startsWith("data:image/").max(32 * 1024 * 1024) }).refine(v => v.width * v.height <= 80000000),
  desktopPollResult: object({ command: desktopDelivery.nullable(), deferClaim: z.boolean().optional() }),
  createChat: object({ apiVersion: z.literal(1), modelId, title: z.string().max(4096).optional() }),
  legacyProviderChange: object({ apiKey: z.string().max(4096), baseUrl: baseUrl.optional(), remove: z.boolean().optional() }),
  promptChange: object({ apiVersion: z.literal(1), id, command: z.string().regex(/^\/[A-Za-z0-9_-]{1,159}$/), name: z.string().min(1).max(256), content: text, expectedUpdatedAt: timestamp.optional() }),
  emptyOperation: object({ apiVersion: z.literal(1) }),
  versionedOperation: object({ apiVersion: z.literal(1), version: count }),
  messagePatch: object({ apiVersion: z.literal(1), version: count, parts: z.array(part).max(256) }),
  chatPage: object({ apiVersion: z.literal(1), items: z.array(chat).max(100), nextCursor: nullableId }),
  submitMessage: object({ apiVersion: z.literal(1), requestId: id, chatVersion: count, parentMessageId: nullableId, modelId,
    parts, origin: z.enum(["manual", "desktop"]), command: command.optional(), action: z.enum(["append", "edit", "regenerate"]).optional(), targetMessageId: id.optional(), regenerationStyle: z.enum(["retry", "detail", "concise"]).optional() })
    .refine(v => (v.origin === "desktop") === (v.command !== undefined))
    .refine(v => v.regenerationStyle === undefined || v.action === "regenerate")
    .refine(v => v.action === "regenerate" ? v.parts.length === 0 : v.parts.some(p => p.type === "image" || p.text.trim().length))
    .refine(v => ((v.action === "edit" || v.action === "regenerate") === (v.targetMessageId !== undefined)) && (v.origin !== "desktop" || !v.action || v.action === "append")),
  publicError, message, chat, generation, event, draft, file, command,
  providerChange: object({ apiVersion: z.literal(1), providerId: id, revision: count, baseUrl, apiType: z.enum(["chat", "responses"]),
    keyAction: z.enum(["keep", "set", "delete"]), apiKey: z.string().min(1).max(4096).optional(), modelIds: z.array(modelId).min(1).max(256) })
    .refine(v => (v.keyAction === "set") === (v.apiKey !== undefined) && (v.apiKey === undefined || v.apiKey.trim().length > 0)),
  publicModel: object({ id: modelId, providerId: id, name: z.string().min(1).max(256), vision: z.boolean(), configured: z.boolean() }),
  providerCatalog: object({ verifiedAt: z.string().min(1).max(80), providers: z.array(object({ id, name: z.string().min(1).max(256),
    models: z.array(modelId).max(256), source: z.string().max(2048), baseUrl, configured: z.boolean(), revision: count.optional(), apiType: z.enum(["chat", "responses"]).optional() })).max(64) }),
  status: object({ apiVersion: z.literal(1), frontendBuild: z.string().min(1).max(80), runtimeKind: z.enum(["legacy", "node"]), ready: z.boolean(), paused: z.boolean(),
    permission: z.enum(["granted", "denied", "not-determined", "restricted", "unknown"]),
    displays: z.array(object({ id: z.string().min(1).max(160), name: z.string().max(160), width: count.min(1), height: count.min(1), primary: z.boolean() })).max(64),
    error: z.string().max(240).nullable(), maxImages: z.literal(12), showCaptureHints: z.literal(false),
    migration: z.enum(["not-started", "running", "validated", "failed"]) }),
  prompt: object({ id, command: z.string().min(1).max(160), name: z.string().min(1).max(256), content: text, updatedAt: timestamp }),
  storedMessage: object({ schemaVersion: z.literal(1), message, providerOutput: legacyPayload, legacy: legacyPayload }),
  desktopPoll: object({ clientId: command.shape.clientId, context: command.shape.context, ready: z.boolean(), active: z.boolean(), claim: z.boolean().optional(),
    reason: z.enum(["", "hidden", "loading", "draft", "generating", "busy"]).optional(), activeCommandId: id.optional() }),
  acceptedSubmission: object({ apiVersion: z.literal(1), chatId: id, generationId: id, userMessageId: id, assistantMessageId: id,
    status, deduplicated: z.boolean(), chatVersion: count }),
  chatPatch: object({ apiVersion: z.literal(1), version: count, title: z.string().max(4096).optional(), pinned: z.boolean().optional(),
    archived: z.boolean().optional(), lastReadAt: timestamp.nullable().optional(), currentMessageId: nullableId.optional(), modelId: modelId.optional() })
    .refine(v => Object.keys(v).some(k => !["apiVersion", "version"].includes(k))),
  draftWrite: object({ apiVersion: z.literal(1), browserClientId: id, expectedRevision: count, modelId, parts }),
  desktopDelivery,
  desktopAck: object({ ...command.shape, success: z.boolean(), error: z.string().max(240).optional() }),
  requestIdentity: object({ deviceId: id, requestId: id, commandId: nullableId, fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }),
};
module.exports = { schemas, id, count, object, publicError, code, status, terminal };
