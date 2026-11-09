// Shared positive fixtures: checked against both declarations and runtime schemas.
/** @type {import("../../contracts/index.js").Message} */
const message = { id: "m1", chatId: "c1", parentMessageId: null, role: "user", modelId: null, parts: [{ type: "text", text: "问题" }], createdAt: 1794000000000, status: null };
/** @type {import("../../contracts/index.js").Chat} */
const chat = { apiVersion: 1, id: "c1", title: "保留分支", version: 2, currentMessageId: "m1", modelId: "alibaba.qwen-plus", pinned: true, archived: false, lastReadAt: null, createdAt: 1794000000000, updatedAt: 1794000000000, messages: [message] };
/** @type {import("../../contracts/index.js").SubmitMessage} */
const submission = { apiVersion: 1, requestId: "r1", chatVersion: 2, parentMessageId: "m1", modelId: chat.modelId,
  parts: [{ type: "text", text: "下一轮" }, { type: "image", fileId: "f2" }, { type: "image", fileId: "f1" }], origin: "manual" };
/** @type {import("../../contracts/index.js").Generation} */
const generation = { apiVersion: 1, id: "g1", chatId: "c1", requestId: "r1", userMessageId: "m2", assistantMessageId: "m3", status: "requesting", lastSeq: 1, parts: [], createdAt: 1794000000000, updatedAt: 1794000000000, error: null };
/** @type {import("../../contracts/index.js").GenerationEvent} */
const event = { apiVersion: 1, chatId: "c1", generationId: "g1", messageId: "m3", seq: 2, type: "delta", partIndex: 0, partType: "text", text: "答案" };
/** @type {import("../../contracts/index.js").ProviderChange} */
const provider = { apiVersion: 1, providerId: "alibaba", revision: 0, baseUrl: "http://127.0.0.1:49999/custom/v1/", apiType: "chat", keyAction: "delete", modelIds: [chat.modelId] };
/** @type {import("../../contracts/index.js").ContractMap} */
const samples = {
  appearance: { apiVersion: 1, themeId: "forest", revision: 0 },
  appearanceChange: { apiVersion: 1, themeId: "ocean" },
  captureRequest: { displayId: "1" },
  capture: { displayId: "1", width: 1440, height: 900, image: "data:image/png;base64,synthetic" },
  desktopPollResult: { command: null, deferClaim: false },
  legacyProviderChange: { apiKey: "", baseUrl: "http://127.0.0.1:49999/v1", remove: true },
  emptyOperation: { apiVersion: 1 },
  messagePatch: { apiVersion: 1, version: 0, parts: [{ type: "text", text: "保存编辑" }] },
  versionedOperation: { apiVersion: 1, version: 0 },
  chatPage: { apiVersion: 1, items: [chat], nextCursor: null },
  createChat: { apiVersion: 1, modelId: chat.modelId },
  promptChange: { apiVersion: 1, id: "prompt1", command: "/snap-solve", name: "解释", content: "用户内容" },
  submitMessage: submission, publicError: { error: "请求失败", code: "PROVIDER_ERROR" }, message, chat, generation, event,
  draft: { apiVersion: 1, browserClientId: "browser-durable", chatKey: "new", revision: 0, modelId: chat.modelId, parts: submission.parts, savedAt: 1794000000000 },
  file: { apiVersion: 1, id: "f1", name: "fixture.png", mime: "image/png", bytes: 42, sha256: "a".repeat(64), width: 1, height: 1, createdAt: 1794000000000 },
  command: { id: "cmd1", clientId: "receiver-session-1234", context: "/c/c1" }, nativeEvent: { protocolVersion: 1, type: "ready", coordinateSpace: "physical" },
  processMessage: { protocolVersion: 1, type: "initialize", dataDirectory: "C:\\fixture\\chat-node", legacySource: null, productVersion: "2.0.0-dev.6", catalogVersion: "fixture-v1", credential: "synthetic-credential-".repeat(2), parentPid: 12, testCapabilities: [] },
  providerChange: provider, publicModel: { id: chat.modelId, providerId: "alibaba", name: "Qwen", vision: true, configured: false },
  status: { apiVersion: 1, frontendBuild: "fixture-v1", runtimeKind: "legacy", ready: true, paused: false, permission: "granted", displays: [], error: null, maxImages: 12, showCaptureHints: false, migration: "not-started" },
  prompt: { id: "prompt1", command: "/solve", name: "解释", content: "用户提示词", updatedAt: 1794000000000 },
  storedMessage: { schemaVersion: 1, message, providerOutput: { opaque_future_output: ["retain"] }, legacy: { unknown: true } },
  desktopPoll: { clientId: "receiver-session-1234", context: "/c/c1", ready: false, active: true, reason: "draft" },
  acceptedSubmission: { apiVersion: 1, chatId: "c1", generationId: "g1", userMessageId: "m2", assistantMessageId: "m3", status: "accepted", deduplicated: false, chatVersion: 3 },
  chatPatch: { apiVersion: 1, version: 2, pinned: true },
  draftWrite: { apiVersion: 1, browserClientId: "browser-durable", expectedRevision: 0, modelId: chat.modelId, parts: submission.parts },
  desktopDelivery: { id: "cmd1", image: "data:image/png;base64,Zml4dHVyZQ==", prompt: "解释", showCaptureHints: false },
  desktopAck: { id: "cmd1", clientId: "receiver-session-1234", context: "/c/c1", success: false, error: "草稿已保留" },
  requestIdentity: { deviceId: "device1", requestId: "r1", commandId: "cmd1", fingerprint: "a".repeat(64) },
  providerCatalog: { verifiedAt: "2026-11-08", providers: [{ id: "alibaba", name: "Alibaba", models: [chat.modelId], source: "https://example.invalid/catalog", baseUrl: provider.baseUrl, configured: false }] },
};
module.exports = { samples, message, chat, submission, generation, event, provider };
