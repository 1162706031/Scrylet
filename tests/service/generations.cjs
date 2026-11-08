const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { Storage } = require("../../service/storage.cjs");
const { Files } = require("../../service/files.cjs");
const { Chats } = require("../../service/chats.cjs");
const { Prompts } = require("../../service/prompts.cjs");
const { Providers } = require("../../service/providers.cjs");
const { Generations } = require("../../service/generations.cjs");
const { createRoutes } = require("../../service/routes.cjs");
const { createHttp } = require("../../service/http.cjs");
const { protocolProvider } = require("../fixtures/protocol-provider.cjs");
async function until(fn) { const deadline = Date.now() + 15000; while (!fn()) { if (Date.now() > deadline) throw Error("GENERATION_TEST_TIMEOUT"); await delay(10); } }
module.exports = async function generationChecks(directory, secrets) {
  const storage = new Storage(directory), files = new Files(storage), chats = new Chats(storage, files), prompts = new Prompts(storage);
  const providers = new Providers(storage, secrets), generations = new Generations(storage, chats, files, providers), mock = await protocolProvider();
  const credential = "test-internal-credential-".repeat(3);
  const server = await createHttp({ credential, route: createRoutes({ chats, files, prompts, providers, generations }) });
  const base = `http://127.0.0.1:${server.address().port}/snap/api`;
  const headers = { authorization: "Bearer " + credential, "x-scrylet-device": "device-one", "content-type": "application/json" };
  const http = async (route, value, method = "POST") => fetch(base + route, { method, headers, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const images = require("../fixtures/legacy-v1/database.json").attachments.map(a => files.put(Buffer.from(a.base64, "base64"), { name: "fixture.jpg", mime: "image/jpeg" }));
  try {
    for (const apiType of ["chat", "responses"]) {
      const revision = providers.row("openai").revision;
      await providers.save("openai", { apiVersion: 1, providerId: "openai", revision, baseUrl: mock.baseURL, apiType, keyAction: "set", apiKey: "synthetic-generation-key", modelIds: ["fixture-model", "cancel", "http-error", "uncertain"] });
      const c = chats.create({ apiVersion: 1, modelId: "openai.fixture-model" });
      const request = { apiVersion: 1, requestId: apiType + "-r1", chatVersion: c.version, parentMessageId: null, modelId: c.modelId,
        origin: "manual", parts: [{ type: "text", text: "原问题" }, ...images.map(f => ({ type: "image", fileId: f.id }))] };
      const count = mock.requests.length;
      const [a, duplicate] = await Promise.all([http(`/chats/${c.id}/messages`, request), http(`/chats/${c.id}/messages`, request)]);
      assert.equal(a.status, 202); assert.equal(duplicate.status, 202);
      const accepted = await a.json(), again = await duplicate.json(); assert.equal(again.generationId, accepted.generationId); assert.deepEqual([accepted.deduplicated, again.deduplicated].sort(), [false, true]);
      const conflicting = await http(`/chats/${c.id}/messages`, { ...request, parts: [{ type: "text", text: "冲突" }] }); assert.equal(conflicting.status, 409);
      await until(() => generations.get(accepted.generationId).status === "completed");
      assert.equal(mock.requests.length, count + 1); assert.equal(chats.get(c.id).messages.length, 2);
      assert.throws(() => generations.lookup("other-device", request.requestId), { code: "NOT_FOUND" });
      const events = generations.replay(accepted.generationId, 0); assert.equal(events[0].type, "begin"); assert.equal(events.at(-1).type, "finish");
      assert.deepEqual(events.map(e => e.seq), Array.from({ length: events.length }, (_, i) => i + 1));
      const regenRequest = { ...request, requestId: apiType + "-regen", chatVersion: 1, parentMessageId: accepted.userMessageId, parts: [], action: "regenerate", targetMessageId: accepted.assistantMessageId };
      const regen = generations.submit(c.id, "device-one", regenRequest);
      await until(() => generations.get(regen.generationId).status === "completed");
      assert.equal(chats.get(c.id).messages.length, 3); assert.equal(regen.userMessageId, accepted.userMessageId);
      const edit = generations.submit(c.id, "device-one", { ...request, requestId: apiType + "-edit", chatVersion: 2,
        action: "edit", targetMessageId: accepted.userMessageId, parts: [{ type: "text", text: "修改后的问题" }] });
      await until(() => generations.get(edit.generationId).status === "completed"); assert.equal(chats.get(c.id).messages.length, 5);
      const editedUpstream = mock.requests.at(-1).body; assert.equal((apiType === "chat" ? editedUpstream.messages : editedUpstream.input).length, 1);
      const followup = generations.submit(c.id, "device-one", { ...request, requestId: apiType + "-followup", chatVersion: 3,
        parentMessageId: edit.assistantMessageId, parts: [{ type: "text", text: "下一轮" }] });
      await until(() => generations.get(followup.generationId).status === "completed");
      const upstream = mock.requests.at(-1).body;
      if (apiType === "responses") assert.equal(upstream.store, false);
      assert.deepEqual((apiType === "chat" ? upstream.messages : upstream.input).map(m => m.role), ["user", "assistant", "user"]);
      const slow = chats.create({ apiVersion: 1, modelId: "openai.cancel" });
      const slowRequest = { ...request, requestId: apiType + "-slow", chatVersion: 0, modelId: slow.modelId, parts: [{ type: "text", text: "保留部分回答" }] };
      const slowAccepted = generations.submit(slow.id, "device-one", slowRequest);
      const sse = await fetch(base + `/generations/${slowAccepted.generationId}/events?after=0`, { headers });
      const reader = sse.body.getReader(); await reader.read(); await reader.cancel();
      await until(() => generations.get(slowAccepted.generationId).status === "streaming");
      await delay(150); assert.equal(generations.get(slowAccepted.generationId).status, "streaming");
      const active = await http(`/chats/${slow.id}`, undefined, "GET"); assert.equal((await active.json()).activeGeneration.id, slowAccepted.generationId);
      const activeConflict = await http(`/chats/${slow.id}/messages`, { ...slowRequest, requestId: apiType + "-competing", chatVersion: 1 }); assert.equal(activeConflict.status, 409);
      const stopped = await generations.stop(slowAccepted.generationId); assert.equal(stopped.status, "stopped"); assert.ok(stopped.parts.some(p => p.text?.length));
      assert.equal((await generations.stop(stopped.id)).status, "stopped");
      await until(() => mock.closed.some(c => c.model === "cancel" && !c.completed));
      assert.equal(generations.lookup("device-one", slowRequest.requestId).status, "stopped");
      for (const model of ["http-error", "uncertain"]) {
        const failureChat = chats.create({ apiVersion: 1, modelId: "openai." + model }), before = mock.requests.length;
        const failureRequest = { ...request, requestId: apiType + "-" + model, modelId: failureChat.modelId, chatVersion: 0, parts: [{ type: "text", text: "失败不重放" }] };
        const failure = generations.submit(failureChat.id, "device-one", failureRequest);
        await until(() => generations.get(failure.generationId).status === "failed");
        const previous = generations.submit(failureChat.id, "device-one", failureRequest); assert.equal(previous.deduplicated, true);
        assert.equal(mock.requests.length, before + 1); assert.equal(generations.get(failure.generationId).error.code, "PROVIDER_ERROR");
      }
      const cmdChat = chats.create({ apiVersion: 1, modelId: c.modelId });
      const cmdRequest = { ...request, requestId: apiType + "-command", chatVersion: 0, origin: "desktop", command: { id: apiType + "-cmd", clientId: "receiver-page-123456", context: "/c/" + cmdChat.id } };
      const command = generations.submit(cmdChat.id, "device-one", cmdRequest);
      assert.throws(() => generations.submit(cmdChat.id, "device-one", { ...cmdRequest, requestId: apiType + "-other-command" }), { code: "REQUEST_CONFLICT" });
      await until(() => generations.get(command.generationId).status === "completed");
      storage.db.prepare("DELETE FROM generation_events WHERE generation_id=? AND seq<?").run(command.generationId, generations.get(command.generationId).lastSeq);
      const recovered = generations.replay(command.generationId, 0); assert.equal(recovered[0].type, "snapshot");
      const beforeDelete = mock.requests.length; chats.delete(cmdChat.id, chats.get(cmdChat.id).version);
      assert.equal(generations.submit(cmdChat.id, "device-one", cmdRequest).deduplicated, true); assert.equal(mock.requests.length, beforeDelete);
    }
    return ["generation-durable-acceptance-http-concurrent-dedup", "generation-edit-regenerate-preserves-five-node-graph", "generation-branch-context-protocol-output-replay", "generation-disconnect-continues-stop-aborts", "generation-errors-uncertain-no-replay-command-unique", "generation-cache-gap-snapshot-delete-receipt"];
  } finally { await generations.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); await mock.stop(); storage.close(); }
};
