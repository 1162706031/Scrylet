const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../contracts/validate.cjs");
const clone = value => structuredClone(value);
const { samples, message, chat, submission, generation, event, provider } = require("./fixtures/contract-samples.cjs");
for (const [kind, sample] of Object.entries(samples)) test(`v1 ${kind}: valid fixture, reject unknown envelope fields`, () => {
  assert.deepEqual(C.validate(kind, sample), sample);
  assert.throws(() => C.validate(kind, { ...sample, attacker: "not-allowed" }), { code: "INVALID_CONTRACT" });
});
test("submit boundary rejects browser identity, reasoning, empty input, excessive images and automatic command mismatch", () => {
  for (const change of [{ apiVersion: 2 }, { deviceId: "forged" }, { parts: [] }, { parts: [{ type: "reasoning", text: "forged" }] },
    { parts: Array.from({ length: 13 }, () => ({ type: "image", fileId: "f1" })) }, { parts: [{ type: "text", text: "x".repeat(1_000_001) }] },
    { chatVersion: -1 }, { chatVersion: 0.5 }, { chatVersion: Infinity }, { origin: "desktop" }, { command: samples.command }])
    assert.throws(() => C.validate("submitMessage", { ...submission, ...change }), { code: "INVALID_CONTRACT" });
  assert.deepEqual(C.validate("submitMessage", { ...submission, origin: "desktop", command: samples.command }).command, samples.command);
});
test("graph retains siblings, rejects duplicate/cross-chat/missing/cyclic relationships and validates submission ownership", () => {
  const c = clone(chat);
  c.messages.push({ ...message, id: "m2", parentMessageId: "m1", role: "assistant", status: "completed" }, { ...message, id: "m3", parentMessageId: "m1", role: "assistant", status: "completed" });
  c.currentMessageId = "m3";
  assert.equal(C.validateGraph(c).messages.length, 3);
  for (const mutate of [v => v.messages.push(message), v => v.messages[0].chatId = "other", v => v.currentMessageId = "missing",
    v => v.messages[0].parentMessageId = "missing", v => v.messages[0].parentMessageId = "m3"])
    { const bad = clone(c); mutate(bad); assert.throws(() => C.validateGraph(bad)); }
  assert.deepEqual(C.validateSubmission(submission, c, new Set(["f1", "f2"])).parts, submission.parts);
  assert.throws(() => C.validateSubmission({ ...submission, chatVersion: 1 }, c, new Set()), { code: "VERSION_CONFLICT", status: 409 });
  assert.throws(() => C.validateSubmission({ ...submission, parentMessageId: "foreign" }, c, new Set()));
  assert.throws(() => C.validateSubmission(submission, c, new Set(["f1"])), { code: "NOT_FOUND" });
});
test("generation terminal states never resume; event sequences and identities cannot drift", () => {
  for (const next of ["completed", "stopped", "failed", "interrupted"]) { C.assertTransition("streaming", next); assert.throws(() => C.assertTransition(next, "requesting")); }
  assert.throws(() => C.assertTransition("streaming", "accepted"));
  assert.deepEqual(C.validateEvent(event, generation), event);
  for (const change of [{ seq: 1 }, { seq: 3 }, { chatId: "foreign" }, { generationId: "foreign" }, { messageId: "foreign" }])
    assert.throws(() => C.validateEvent({ ...event, ...change }, generation), { code: "VERSION_CONFLICT" });
  assert.throws(() => C.validateEvent(event, { ...generation, status: "completed" }));
  assert.throws(() => C.validate("generation", { ...generation, status: "failed" }));
});
test("provider deletion is explicit; blank keep never becomes set, URL cannot carry credentials", () => {
  for (const change of [{ apiKey: "" }, { apiKey: "synthetic" }, { keyAction: "set" }, { keyAction: "set", apiKey: "  " },
    { baseUrl: "https://user:secret@example.invalid/v1" }, { baseUrl: "https://example.invalid/v1?key=secret" }, { baseUrl: "file:///fixture" }, { baseUrl: "https://example.invalid/#secret" }])
    assert.throws(() => C.validate("providerChange", { ...provider, ...change }));
  C.validate("providerChange", { ...provider, keyAction: "keep" });
  C.validate("providerChange", { ...provider, keyAction: "set", apiKey: "synthetic" });
});
test("IPC and native schemas reject version/method/path drift; errors do not expose input", () => {
  for (const change of [{ protocolVersion: 2 }, { type: "run-sql" }, { dataDirectory: "relative" }, { credential: "" }, { testCapabilities: ["shell"] }])
    assert.throws(() => C.validate("processMessage", { ...samples.processMessage, ...change }));
  for (const operation of ["get", "set", "delete"]) C.validate("processMessage", { protocolVersion: 1, type: "secret-request", requestId: "r1", providerId: "alibaba", operation, ...(operation === "set" ? { value: "synthetic" } : {}) });
  assert.throws(() => C.validate("processMessage", { protocolVersion: 1, type: "secret-request", requestId: "r1", providerId: "alibaba", operation: "get", value: "secret" }));
  C.validate("processMessage", { protocolVersion: 1, type: "secret-response", requestId: "r1", ok: true, value: null });
  C.validate("processMessage", { protocolVersion: 1, type: "secret-response", requestId: "r1", ok: false, error: "密钥不可读", code: "STORAGE_FAILED" });
  assert.throws(() => C.validate("processMessage", { protocolVersion: 1, type: "secret-response", requestId: "r1", ok: false, value: "secret" }));
  assert.deepEqual(C.parseNativeLine('{"protocolVersion":1,"type":"move","x":-320,"y":240}\n'), { protocolVersion: 1, type: "move", x: -320, y: 240 });
  for (const line of ['{"protocolVersion":1,"type":"cancel"}', '{}\n{}\n', "x".repeat(1025) + "\n", '{"protocolVersion":1,"type":"move","x":null,"y":0}\n']) assert.throws(() => C.parseNativeLine(line));
  try { C.validate("status", { credential: "never-expose-this" }); } catch (error) { assert.ok(!JSON.stringify(error).includes("never-expose-this")); }
  assert.throws(() => C.validate("status", { ...samples.status, showCaptureHints: true }));
});
test("draft revision and dedup conflicts preserve caller data; unknown disk metadata remains local", () => {
  const draft = clone(samples.draft), before = clone(draft);
  assert.throws(() => C.assertRevision(draft.revision, 1), { code: "DRAFT_CONFLICT", status: 409 }); assert.deepEqual(draft, before);
  const identity = samples.requestIdentity;
  C.assertReplay(identity, { ...identity });
  for (const change of [{ deviceId: "other" }, { requestId: "other" }, { commandId: "other" }, { fingerprint: "b".repeat(64) }])
    assert.throws(() => C.assertReplay(identity, { ...identity, ...change }), { code: "REQUEST_CONFLICT", status: 409 });
  assert.deepEqual(C.validate("storedMessage", samples.storedMessage).legacy, { unknown: true });
  for (const value of [() => {}, { n: Infinity }, { omitted: undefined }]) assert.throws(() => C.validate("storedMessage", { ...samples.storedMessage, legacy: value }));
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => C.validate("storedMessage", { ...samples.storedMessage, legacy: cycle }));
});
test("every runtime boundary has a declaration-checked positive fixture", () => {
  assert.deepEqual(Object.keys(C.schemas).sort(), Object.keys(samples).sort());
});
test("recovery may jump forward to a matching durable snapshot without resuming a terminal generation", () => {
  const snapshot = { ...generation, status: "completed", lastSeq: 20 };
  const recovery = { apiVersion: 1, type: "snapshot", chatId: generation.chatId, generationId: generation.id, messageId: generation.assistantMessageId, seq: 20, snapshot };
  assert.deepEqual(C.validateRecovery(recovery, generation), snapshot);
  assert.throws(() => C.validateRecovery({ ...recovery, snapshot: { ...snapshot, requestId: "foreign" } }, generation));
  assert.throws(() => C.validateRecovery({ ...recovery, snapshot: { ...snapshot, status: "streaming" } }, snapshot));
  assert.deepEqual(C.validateRecovery(recovery, snapshot), snapshot);
});
test("HTTP draft fixes one explicit submission route; resume, lookup, draft and stop cannot create generation", () => {
  const http = require("../contracts/http-v1.json");
  assert.equal(http.apiVersion, 1); assert.equal(http.stage, "isolated-node");
  assert.deepEqual(http.routes.filter(r => r.startsGeneration).map(r => [r.method, r.path, r.status]), [["POST", "/chats/:id/messages", 202]]);
  assert.equal(new Set(http.routes.map(r => r.method + " " + r.path)).size, http.routes.length);
  for (const route of http.routes) {
    if (route.request) assert.ok(C.schemas[route.request]);
    if (route.response) assert.ok(C.schemas[route.response.replace(/\[\]$/, "")]);
  }
});
