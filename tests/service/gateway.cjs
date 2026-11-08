const assert = require("node:assert/strict");
const path = require("node:path");
const http = require("node:http");
const { setTimeout: delay } = require("node:timers/promises");
const { NodeRuntime } = require("../../desktop/node-runtime.cjs");
const { Gateway } = require("../../desktop/gateway.cjs");
const { validate } = require("../../contracts/validate.cjs");
const { protocolProvider } = require("../fixtures/protocol-provider.cjs");
async function until(fn) { const deadline = Date.now() + 15000; while (!(await fn())) { if (Date.now() > deadline) throw Error("GATEWAY_TEST_TIMEOUT"); await delay(15); } }
module.exports = async function gatewayChecks(directory) {
  const runtime = new NodeRuntime(directory), mock = await protocolProvider();
  const native = { permission: () => "granted", displays: () => [], capture: async () => { throw Error("NOT_USED"); } };
  const gateway = new Gateway(directory, native, runtime); await gateway.start(); const base = `http://127.0.0.1:${gateway.port}`;
  let cookie;
  const call = (route, body, method = "GET", extra = {}) => fetch(base + route, { method, headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json", "x-snap-client": "mobile", ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const get = async route => { const response = await call(route); assert.equal(response.status, 200); return response.json(); };
  try {
    let r = await fetch(base + "/snap/api/chats", { headers: { accept: "text/html" }, redirect: "manual" }); assert.equal(r.status, 401); assert.equal((await r.json()).code, "UNAUTHORIZED");
    r = await call("/snap/api/pair", { credential: gateway.pairing.info().token, name: "M1 Test Phone" }, "POST"); assert.equal(r.status, 200);
    cookie = r.headers.get("set-cookie").split(";")[0];
    r = await call("/snap/api/chats"); assert.equal(r.status, 503);
    await runtime.start();
    const status = await get("/snap/api/status"); validate("status", status); assert.equal(status.runtimeKind, "node"); assert.equal(status.showCaptureHints, false);
    r = await call("/snap/api/desktop/poll", { clientId: "invalid" }, "POST"); assert.equal(r.status, 400); assert.equal(validate("publicError", await r.json()).code, "INVALID_CONTRACT");
    r = await call("/snap/api/desktop/ack", { id: "expired", clientId: "receiver-expired-1234", context: "/:expired", success: true }, "POST"); assert.equal(r.status, 409); assert.equal(validate("publicError", await r.json()).code, "VERSION_CONFLICT");
    assert.equal((await get("/snap/api/available-models")).available, false);
    r = await call("/snap/api/providers/openai", { apiKey: "synthetic-ui-key", baseUrl: mock.baseURL }, "POST"); assert.equal(r.status, 200);
    assert.equal((await get("/snap/api/available-models")).available, true);
    const provider = (await get("/snap/api/providers")).providers.find(p => p.id === "openai");
    r = await call("/snap/api/providers/openai", { apiVersion: 1, providerId: "openai", revision: provider.revision, baseUrl: mock.baseURL, apiType: "chat", keyAction: "keep", modelIds: ["fixture-model", "cancel"] }, "POST"); assert.equal(r.status, 200);
    for (const route of ["/api/models", "/openai/config", "/snap/api/health", "/snap/api/admin", "/snap/api/files/a%2f..%2fsecret", "/snap/api/chats?arbitrary=1"]) {
      const denied = await call(route); assert.ok([400,404].includes(denied.status), route);
    }
    r = await call("/snap/api/models", undefined, "GET", { origin: "https://elsewhere.invalid" }); assert.equal(r.status, 403);
    const hostStatus = await new Promise((resolve, reject) => {
      const request = http.get({ host: "127.0.0.1", port: gateway.port, path: "/snap/api/models", headers: { host: "evil.invalid", cookie } }, response => { response.resume(); resolve(response.statusCode); });
      request.on("error", reject);
    }); assert.equal(hostStatus, 403);
    r = await call("/snap/api/chats", { apiVersion: 1, modelId: "openai.fixture-model" }, "POST", { "x-snap-client": "" }); assert.equal(r.status, 403);
    const create = await call("/snap/api/chats", { apiVersion: 1, modelId: "openai.fixture-model" }, "POST"); assert.equal(create.status, 201); const chat = await create.json();
    const draft = { apiVersion: 1, browserClientId: "durable-browser", expectedRevision: 0, modelId: chat.modelId, parts: [{ type: "text", text: "草稿保留" }] };
    r = await call("/snap/api/drafts/new", draft, "PUT", { authorization: "Bearer attacker", "x-scrylet-device": "forged-device", "x-openwebui-user-id": "attacker", "x-forwarded-for": "attacker" }); assert.equal(r.status, 200);
    assert.equal((await get("/snap/api/drafts/new?browserClientId=durable-browser")).revision, 1);
    r = await call("/snap/api/drafts/new", draft, "PUT"); assert.equal(r.status, 409); assert.equal((await r.json()).code, "DRAFT_CONFLICT");
    const fileSource = require("../fixtures/legacy-v1/database.json").attachments[0];
    const upload = await fetch(base + "/snap/api/files?name=phone.jpg", { method: "POST", headers: { cookie, "x-snap-client": "mobile", "content-type": "image/jpeg" }, body: Buffer.from(fileSource.base64, "base64") });
    assert.equal(upload.status, 201); const file = await upload.json();
    const download = await call("/snap/api/files/" + file.id); assert.equal(download.status, 200); assert.equal(Buffer.from(await download.arrayBuffer()).toString("base64"), fileSource.base64);
    const value = { apiVersion: 1, requestId: "gateway-manual", chatVersion: 0, parentMessageId: null, modelId: chat.modelId, origin: "manual", parts: [{ type: "text", text: "通过真实网关" }, { type: "image", fileId: file.id }] };
    r = await call(`/snap/api/chats/${chat.id}/messages`, value, "POST", { authorization: "Bearer forged", "x-scrylet-device": "forged-device" }); assert.equal(r.status, 202); const generation = await r.json();
    await until(async () => (await get(`/snap/api/generations/${generation.generationId}`)).status === "completed");
    assert.equal((await get("/snap/api/requests/" + value.requestId)).generationId, generation.generationId);
    const secondToken = gateway.pairing.pair(gateway.pairing.info().token, "Other Phone", "fixture");
    r = await call("/snap/api/requests/" + value.requestId, undefined, "GET", { cookie: "snap_device=" + secondToken, "x-scrylet-device": gateway.pairing.list()[0].id }); assert.equal(r.status, 404);
    const slowResponse = await call("/snap/api/chats", { apiVersion: 1, modelId: "openai.cancel" }, "POST"); const slowChat = await slowResponse.json();
    r = await call(`/snap/api/chats/${slowChat.id}/messages`, { ...value, requestId: "gateway-pause", modelId: slowChat.modelId, parts: [{ type: "text", text: "暂停不停止" }] }, "POST"); const slow = await r.json();
    const subscribe = await call(`/snap/api/generations/${slow.generationId}/events?after=0`); assert.equal(subscribe.status, 200);
    const reader = subscribe.body.getReader(); await reader.read();
    await until(async () => (await get(`/snap/api/generations/${slow.generationId}`)).status === "streaming");
    gateway.pause(true); await reader.read().catch(() => {}); await reader.cancel().catch(() => {});
    assert.equal((await call("/snap/api/models")).status, 423); assert.equal((await get("/snap/api/status")).paused, true);
    await delay(120); gateway.pause(false);
    assert.equal((await get(`/snap/api/generations/${slow.generationId}`)).status, "streaming");
    r = await call(`/snap/api/generations/${slow.generationId}/stop`, { apiVersion: 1 }, "POST"); assert.equal(r.status, 200); assert.equal((await r.json()).status, "stopped");
    // New automatic submissions require the exact live single receiver and context.
    const autoChatResponse = await call("/snap/api/chats", { apiVersion: 1, modelId: chat.modelId }, "POST"); const autoChat = await autoChatResponse.json();
    const clientId = "receiver-page-123456", context = `/c/${autoChat.id}:1`, device = gateway.pairing.list()[0];
    const poll = { clientId, context, active: true, ready: true, claim: true, reason: "" };
    await call("/snap/api/desktop/poll", poll, "POST");
    const delivery = gateway.delivery.send(gateway.delivery.target(), { image: "data:image/jpeg;base64," + fileSource.base64 }, "解释");
    delivery.catch(() => {});
    const pending = await (await call("/snap/api/desktop/poll", poll, "POST")).json(); const command = { id: pending.command.id, clientId, context };
    const auto = { ...value, requestId: "gateway-auto", origin: "desktop", command };
    r = await call(`/snap/api/chats/${autoChat.id}/messages`, { ...auto, command: { ...command, clientId: "other-page-12345678" } }, "POST"); assert.equal(r.status, 409);
    r = await call(`/snap/api/chats/${autoChat.id}/messages`, { ...auto, command: { ...command, context: "/changed" } }, "POST"); assert.equal(r.status, 409);
    await call("/snap/api/desktop/poll", { ...poll, ready: false, reason: "draft" }, "POST");
    r = await call(`/snap/api/chats/${autoChat.id}/messages`, auto, "POST"); assert.equal(r.status, 409);
    await call("/snap/api/desktop/poll", { ...poll, ready: false, reason: "busy", activeCommandId: command.id }, "POST");
    r = await call(`/snap/api/chats/${autoChat.id}/messages`, auto, "POST"); assert.equal(r.status, 202); const automatic = await r.json();
    await call("/snap/api/desktop/ack", { clientId, id: command.id, context, success: true }, "POST"); await delivery;
    await until(async () => (await get(`/snap/api/generations/${automatic.generationId}`)).status === "completed");
    const before = mock.requests.length;
    r = await call(`/snap/api/chats/${autoChat.id}/messages`, auto, "POST"); assert.equal(r.status, 409); assert.equal(mock.requests.length, before);
    const revokedChat = await (await call("/snap/api/chats", { apiVersion: 1, modelId: "openai.cancel" }, "POST")).json();
    const revoked = await (await call(`/snap/api/chats/${revokedChat.id}/messages`, { ...value, requestId: "gateway-revoke", modelId: revokedChat.modelId }, "POST")).json();
    await until(async () => (await get(`/snap/api/generations/${revoked.generationId}`)).status === "streaming");
    const activeStream = await call(`/snap/api/generations/${revoked.generationId}/events?after=0`); const activeReader = activeStream.body.getReader(); await activeReader.read();
    gateway.revoke(device.id); await activeReader.read().catch(() => {}); await activeReader.cancel().catch(() => {});
    assert.equal((await call("/snap/api/models")).status, 401);
    cookie = "snap_device=" + secondToken;
    assert.equal((await get(`/snap/api/generations/${revoked.generationId}`)).status, "streaming");
    await call(`/snap/api/generations/${revoked.generationId}/stop`, { apiVersion: 1 }, "POST");
    runtime.ready = false; r = await call("/snap/api/models"); assert.equal(r.status, 503); runtime.ready = true;
    assert.equal(mock.requests.length, before + 1);
    return ["gateway-unpaired-cross-site-host-write-whitelist", "gateway-overwrites-internal-auth-and-device-headers", "gateway-files-drafts-model-setup-available-models", "gateway-sse-pause-revoke-disconnect-without-stop", "gateway-single-receiver-context-draft-busy-command-ack-loss"];
  } finally { await runtime.stop(); await gateway.close(); await mock.stop(); }
};
