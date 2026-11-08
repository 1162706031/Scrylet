const http = require("node:http");
const { setTimeout: delay } = require("node:timers/promises");
// Synthetic protocol server, separate from the legacy UI's historical mock.
async function protocolProvider({ answer = "两张图片与历史顺序已保留。" } = {}) {
  const requests = [], closed = [];
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const record = { path: req.url, body }; requests.push(record);
    let completed = false;
    res.on("close", () => closed.push({ model: body.model, completed }));
    if (body.model === "http-error") {
      res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "0" });
      res.end(JSON.stringify({ error: { message: "synthetic rate limit", type: "rate_limit_error", code: "rate_limit_exceeded" } })); return;
    }
    if (body.model === "uncertain") { req.socket.destroy(); return; }
    if (!/^\/custom\/v1\/(chat\/completions|responses)$/.test(req.url)) { res.writeHead(404); res.end(); return; }
    const responses = req.url.endsWith("/responses");
    const item = { id: "msg_fixture", type: "message", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: answer, annotations: [] }] };
    const response = { id: "resp_fixture", object: "response", created_at: 1794000000, model: body.model,
      status: "completed", output: [item], usage: { input_tokens: 6, output_tokens: 4, total_tokens: 10 } };
    if (!body.stream) {
      completed = true; res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responses ? response : { id: "chat_fixture", object: "chat.completion", created: 1794000000,
        model: body.model, choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
        usage: { prompt_tokens: 6, completion_tokens: 4, total_tokens: 10 } })); return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    const event = data => res.write((responses ? "event: " + data.type + "\n" : "") + "data: " + JSON.stringify(data) + "\n\n");
    if (responses) {
      event({ type: "response.created", response });
      event({ type: "response.output_item.added", output_index: 0, item: { ...item, content: [], status: "in_progress" } });
    }
    const text = body.model === "cancel" ? answer.repeat(100) : answer;
    for (let i = 0; i < text.length && !res.destroyed; i += 3) {
      event(responses ? { type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta: text.slice(i, i + 3) }
        : { id: "chat_fixture", object: "chat.completion.chunk", model: body.model,
          choices: [{ index: 0, delta: { content: text.slice(i, i + 3) }, finish_reason: null }] });
      await delay(body.model === "cancel" ? 50 : 2);
    }
    if (res.destroyed) return;
    if (responses) {
      event({ type: "response.output_item.done", output_index: 0, item });
      event({ type: "response.completed", response });
    } else {
      event({ id: "chat_fixture", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      res.write("data: [DONE]\n\n");
    }
    completed = true; res.end();
  });
  // Some Windows dynamic-port configurations include fetch's forbidden ports
  // (e.g. 6000/6667). Select an unblocked high port before any model request.
  await require("../../service/listen.cjs").listenAutomatic(server);
  if (!server.listening) throw Error("FIXTURE_PORT_UNAVAILABLE");
  return { requests, closed, baseURL: `http://127.0.0.1:${server.address().port}/custom/v1`,
    async stop() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
module.exports = { protocolProvider };
