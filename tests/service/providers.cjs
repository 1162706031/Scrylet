const assert = require("node:assert/strict");
const { Storage } = require("../../service/storage.cjs");
const { Providers } = require("../../service/providers.cjs");
const { protocolProvider } = require("../fixtures/protocol-provider.cjs");
module.exports = async function providerChecks(directory, secrets) {
  const storage = new Storage(directory), mock = await protocolProvider();
  try {
    const providers = new Providers(storage, secrets, { fetch: (input, options) => {
      assert.equal(new URL(typeof input === "string" || input instanceof URL ? input : input.url).origin, new URL(mock.baseURL).origin); return fetch(input, options);
    } });
    assert.equal(providers.models().filter(m => m.configured).length, 0);
    assert.equal(mock.requests.length, 0);
    const images = require("../fixtures/legacy-v1/database.json").attachments;
    const messages = [{ role: "user", content: [{ type: "text", text: "历史两图" }, ...images.map(a => ({ type: "file", data: Buffer.from(a.base64, "base64"), mediaType: "image/jpeg" }))] },
      { role: "assistant", content: "旧回答" }, { role: "user", content: "继续" }];
    for (const apiType of ["chat", "responses"]) {
      const row = providers.directory().providers.find(p => p.id === "openai");
      const saved = { apiVersion: 1, providerId: "openai", revision: row.revision, apiType, baseUrl: mock.baseURL + "/", keyAction: "set", apiKey: "test-only-never-real", modelIds: ["fixture-model", "cancel", "http-error", "uncertain"] };
      await providers.save("openai", saved);
      const before = mock.requests.length;
      const generated = await providers.generate("openai.fixture-model", messages);
      assert.equal(generated.text, "两张图片与历史顺序已保留。");
      const stream = await providers.stream("openai.fixture-model", messages);
      let content = ""; for await (const text of stream.textStream) content += text;
      assert.equal(content, generated.text); assert.equal(await stream.finishReason, "stop");
      assert.equal(mock.requests.length, before + 2);
      const r = mock.requests.at(-1);
      assert.equal(r.path, `/custom/v1/${apiType === "chat" ? "chat/completions" : "responses"}`); assert.equal(r.body.model, "fixture-model");
      const upstream = apiType === "chat" ? r.body.messages : r.body.input;
      assert.deepEqual(upstream.map(m => m.role), ["user", "assistant", "user"]);
      const encoded = upstream[0].content.filter(p => p.type === "image_url" || p.type === "input_image").map(p => typeof p.image_url === "string" ? p.image_url : p.image_url.url);
      assert.deepEqual(encoded, images.map(a => "data:image/jpeg;base64," + a.base64));
      const trusted = [{ role: "system", content: "持久系统提示" }, ...messages, { role: "system", content: "为本次回答补充细节" }];
      const instructed = await providers.stream("openai.fixture-model", trusted); for await (const _text of instructed.textStream) {};
      assert.equal(await instructed.finishReason, "stop");
      const instructionBody = JSON.stringify(mock.requests.at(-1).body); assert.ok(instructionBody.includes("持久系统提示") && instructionBody.includes("补充细节"));
      for (const fault of ["http-error", "uncertain"]) {
        const prior = mock.requests.length; await assert.rejects(providers.generate("openai." + fault, messages)); assert.equal(mock.requests.length, prior + 1);
      }
      const controller = new AbortController(), cancellation = await providers.stream("openai.cancel", messages, controller.signal);
      for await (const chunk of cancellation.fullStream) if (chunk.type === "text-delta") controller.abort();
      for (let n = 0; n < 100 && !mock.closed.some(c => c.model === "cancel" && !c.completed); n++) await new Promise(r => setTimeout(r, 10));
      assert.ok(mock.closed.some(c => c.model === "cancel" && !c.completed));
      const current = providers.directory().providers.find(p => p.id === "openai");
      await providers.save("openai", { ...saved, apiKey: undefined, revision: current.revision, keyAction: "keep" });
    }
    const current = providers.directory().providers.find(p => p.id === "openai");
    await providers.save("openai", { apiVersion: 1, providerId: "openai", revision: current.revision, baseUrl: mock.baseURL, apiType: "responses", keyAction: "delete", modelIds: ["fixture-model"] });
    assert.equal(new Providers(storage, secrets).directory().providers.find(p => p.id === "openai").configured, false);
    await assert.rejects(providers.model("openai.fixture-model"), { code: "NOT_READY" });
    assert.ok(!JSON.stringify(providers.directory()).includes("test-only-never-real"));
    assert.ok(!require("node:fs").readFileSync(require("node:path").join(storage.root, "chat.sqlite")).includes(Buffer.from("test-only-never-real")));
    let refuseDelete = false;
    const withFault = new Providers(storage, value => { if (refuseDelete && value.operation === "delete") throw new (require("../../contracts/validate.cjs").ContractError)("STORAGE_FAILED", 503); return secrets(value); });
    const setting = { apiVersion: 1, providerId: "alibaba", revision: 0, baseUrl: mock.baseURL, apiType: "chat", keyAction: "set", apiKey: "synthetic-deletion-fault", modelIds: ["fixture-model"] };
    await withFault.save("alibaba", setting); refuseDelete = true;
    await assert.rejects(withFault.save("alibaba", { ...setting, revision: 1, keyAction: "delete", apiKey: undefined }), { code: "STORAGE_FAILED" });
    assert.equal(withFault.directory().providers.find(p => p.id === "alibaba").configured, false);
    assert.equal(storage.db.prepare("SELECT count(*) n FROM pending_secret_deletes").get().n, 1);
    await assert.rejects(withFault.flushDeletes(), { code: "STORAGE_FAILED" }); refuseDelete = false; await withFault.flushDeletes();
    assert.equal(storage.db.prepare("SELECT count(*) n FROM pending_secret_deletes").get().n, 0);
    await providers.save("doubao", { apiVersion: 1, providerId: "doubao", revision: 0, baseUrl: mock.baseURL, apiType: "chat", keyAction: "set", apiKey: "synthetic-literal-model", modelIds: ["doubao.literal-model"] });
    await providers.generate("doubao.doubao.literal-model", messages); assert.equal(mock.requests.at(-1).body.model, "doubao.literal-model");
    return ["provider-chat-responses-json-sse-real-sdk", "provider-images-history-model-custom-url", "provider-error-uncertain-cancel-no-retry", "provider-keep-delete-no-reseed-no-plaintext", "provider-delete-failure-tombstone-retry-literal-model-id"];
  } finally { await mock.stop(); storage.close(); }
};
