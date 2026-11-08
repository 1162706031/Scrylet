const assert = require("node:assert/strict");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { NodeRuntime } = require("../../desktop/node-runtime.cjs");
const { protocolProvider } = require("../fixtures/protocol-provider.cjs");
async function until(fn) { const deadline = Date.now() + 15000; while (!(await fn())) { if (Date.now() > deadline) throw Error("UTILITY_TEST_TIMEOUT"); await delay(20); } }
module.exports = async function utilityChecks(directory) {
  const mock = await protocolProvider(); let runtime;
  let headers;
  const request = async (route, value, method = "GET") => {
    const response = await fetch(runtime.url + "/snap/api" + route, { method, headers, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    assert.ok(response.ok, `internal response ${response.status}`); return response.json();
  };
  const start = async () => { runtime = new NodeRuntime(directory); await runtime.start(); headers = { authorization: "Bearer " + runtime.credential, "x-scrylet-device": "fixture-device", "content-type": "application/json" }; };
  try {
    await start();
    const competitor = new NodeRuntime(directory);
    await assert.rejects(competitor.start(), { code: "STORAGE_FAILED" }); await competitor.stop();
    assert.equal(runtime.ready, true);
    await runtime.saveProvider("openai", { apiVersion: 1, providerId: "openai", revision: 0, baseUrl: mock.baseURL, apiType: "responses", keyAction: "set", apiKey: "synthetic-only", modelIds: ["cancel"] });
    const image = require("../fixtures/legacy-v1/database.json").attachments[0];
    const upload = await fetch(runtime.url + "/snap/api/files?name=fixture.jpg", { method: "POST", headers: { ...headers, "content-type": "image/jpeg" }, body: Buffer.from(image.base64, "base64") });
    assert.equal(upload.status, 201); const file = await upload.json();
    const c = await request("/chats", { apiVersion: 1, modelId: "openai.cancel" }, "POST");
    const value = { apiVersion: 1, requestId: "crash-uncertain", chatVersion: 0, parentMessageId: null, modelId: c.modelId, origin: "manual", parts: [{ type: "text", text: "实际子进程中断" }, { type: "image", fileId: file.id }] };
    const accepted = await request(`/chats/${c.id}/messages`, value, "POST");
    await until(async () => (await request(`/generations/${accepted.generationId}`)).parts.some(p => p.text?.length));
    const before = mock.requests.length, partial = (await request(`/generations/${accepted.generationId}`)).parts[0].text;
    const exited = once(runtime, "exit"); runtime.child.kill(); await exited;
    assert.equal(runtime.ready, false); assert.ok(runtime.error);
    await start();
    const recovered = await request(`/generations/${accepted.generationId}`);
    assert.equal(recovered.status, "interrupted"); assert.ok(recovered.parts[0].text.startsWith(partial)); assert.equal(recovered.error.code, "INTERRUPTED");
    const lookup = await request("/requests/" + value.requestId); assert.equal(lookup.status, "interrupted");
    const again = await request(`/chats/${c.id}/messages`, value, "POST"); assert.equal(again.deduplicated, true);
    await delay(150); assert.equal(mock.requests.length, before);
    const download = await fetch(runtime.url + "/snap/api/files/" + file.id, { headers });
    assert.equal(download.status, 200); assert.equal(Buffer.from(await download.arrayBuffer()).toString("base64"), image.base64);
    const nextChat = await request("/chats", { apiVersion: 1, modelId: "openai.cancel" }, "POST");
    const next = await request(`/chats/${nextChat.id}/messages`, { ...value, requestId: "shutdown-interrupted" }, "POST");
    await until(async () => (await request(`/generations/${next.generationId}`)).status === "streaming");
    await runtime.stop(); assert.equal(runtime.error, "");
    await start(); assert.equal((await request(`/generations/${next.generationId}`)).status, "interrupted");
    assert.equal(mock.requests.length, before + 1);
    return ["utility-competing-writer-rejected", "utility-crash-restart-partial-interrupted-no-replay", "utility-durable-files-requests-real-sdk-responses", "utility-shutdown-aborts-interrupted-not-stopped"];
  } finally { await runtime?.stop(); await mock.stop(); }
};
