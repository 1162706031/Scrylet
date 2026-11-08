const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { setTimeout: delay } = require("node:timers/promises");
const { protocolProvider } = require("./fixtures/protocol-provider.cjs");
const load = name => import(pathToFileURL(require.resolve(name)).href);
const imageA = Buffer.from("synthetic-image-a"), imageB = Buffer.from("synthetic-image-b");
// Encoding/protocol fixture only; actual decodable uploaded images are frozen by formats.spec.
const messages = [{ role: "user", content: [{ type: "text", text: "历史图片问题" },
  { type: "file", data: imageA, mediaType: "image/png" }, { type: "file", data: imageB, mediaType: "image/png" }] },
{ role: "assistant", content: "历史回答" }, { role: "user", content: "继续" }];

for (const protocol of ["chat", "responses"]) {
  for (const trailingSlash of [false, true]) for (const stream of [false, true]) {
    test(`SDK ${protocol} ${stream ? "SSE" : "JSON"} custom path${trailingSlash ? " + trailing slash" : ""}, multi-image and history`, async () => {
      const fixture = await protocolProvider();
      try {
        const { generateText, streamText } = await load("ai");
        const baseURL = fixture.baseURL + (trailingSlash ? "/" : "");
        const guardedFetch = (input, options) => {
          const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
          assert.equal(url.origin, new URL(baseURL).origin); return fetch(input, options);
        };
        const model = protocol === "chat"
          ? (await load("@ai-sdk/openai-compatible")).createOpenAICompatible({ name: "fixture", baseURL, apiKey: "synthetic-only", fetch: guardedFetch })("fixture-model")
          : (await load("@ai-sdk/openai")).createOpenAI({ baseURL, apiKey: "synthetic-only", fetch: guardedFetch }).responses("fixture-model");
        const options = { model, messages, maxRetries: 0 };
        let result, text = "";
        if (stream) { result = streamText(options); for await (const delta of result.textStream) text += delta; }
        else { result = await generateText(options); text = result.text; }
        assert.equal(text, "两张图片与历史顺序已保留。");
        assert.equal(await result.finishReason, "stop");
        assert.equal(fixture.requests.length, 1);
        const request = fixture.requests[0];
        assert.equal(request.path, `/custom/v1/${protocol === "chat" ? "chat/completions" : "responses"}`);
        assert.equal(request.body.model, "fixture-model");
        const encoded = protocol === "chat" ? request.body.messages : request.body.input;
        assert.deepEqual(encoded.map(m => m.role), ["user", "assistant", "user"]);
        const content = encoded[0].content;
        const urls = content.filter(p => ["image_url", "input_image"].includes(p.type)).map(p => typeof p.image_url === "string" ? p.image_url : p.image_url.url);
        assert.deepEqual(urls, [imageA, imageB].map(b => "data:image/png;base64," + b.toString("base64")));
        assert.equal(encoded[1].content === "历史回答" || encoded[1].content.some(p => p.text === "历史回答"), true);
      } finally { await fixture.stop(); }
    });
  }
  for (const fault of ["http-error", "uncertain", "cancel"]) test(`SDK ${protocol} ${fault}: one request, no retry or replay`, async () => {
    const fixture = await protocolProvider();
    try {
      const { generateText, streamText } = await load("ai");
      const model = protocol === "chat"
        ? (await load("@ai-sdk/openai-compatible")).createOpenAICompatible({ name: "fixture", baseURL: fixture.baseURL, apiKey: "synthetic-only" })(fault)
        : (await load("@ai-sdk/openai")).createOpenAI({ baseURL: fixture.baseURL, apiKey: "synthetic-only" }).responses(fault);
      if (fault === "cancel") {
        const controller = new AbortController();
        const result = streamText({ model, messages, maxRetries: 0, abortSignal: controller.signal });
        let count = 0;
        for await (const part of result.fullStream) { if (part.type === "text-delta") { count++; controller.abort(); } }
        assert.ok(count > 0);
        for (let i = 0; i < 100 && !fixture.closed.length; i++) await delay(10);
        assert.ok(fixture.closed.some(c => c.model === fault && !c.completed));
      } else {
        await assert.rejects(generateText({ model, messages, maxRetries: 0 }), error => {
          assert.ok(fixture.requests.length > 0, `${error.name}: ${error.message}`); return true;
        });
      }
      assert.equal(fixture.requests.length, 1);
    } finally { await fixture.stop(); }
  });
}
