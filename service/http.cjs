const http = require("node:http");
const crypto = require("node:crypto");
const { ContractError } = require("../contracts/validate.cjs");
const messages = { INVALID_CONTRACT: "请求格式不正确", VERSION_CONFLICT: "会话已变化，请保留草稿后刷新", REQUEST_CONFLICT: "请求标识已使用，请查看历史", DRAFT_CONFLICT: "草稿已变化，当前内容已保留", NOT_FOUND: "记录不存在", UNAUTHORIZED: "内部服务未授权", FORBIDDEN: "不允许此操作", PAUSED: "电脑已暂停手机访问", NOT_READY: "聊天服务尚未就绪", TOO_LARGE: "请求内容过大", PROVIDER_ERROR: "模型请求失败，请检查连接设置", INTERRUPTED: "请求已中断，未自动重发", STORAGE_FAILED: "无法保存本机数据", MIGRATION_FAILED: "数据版本不兼容", PROTOCOL_MISMATCH: "运行协议不兼容" };
function publicError(error) {
  const code = error instanceof ContractError && Object.hasOwn(messages, error.code) ? error.code : "STORAGE_FAILED";
  return { code, error: messages[code] };
}
function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(value));
}
function readBytes(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0;
    request.on("data", chunk => { bytes += chunk.length; if (bytes <= limit) chunks.push(chunk); });
    request.once("end", () => bytes > limit ? reject(new ContractError("TOO_LARGE", 413)) : resolve(Buffer.concat(chunks)));
    request.once("error", () => reject(new ContractError()));
    request.once("aborted", () => reject(new ContractError()));
  });
}
async function body(request, limit = 2 * 1024 * 1024) {
  const bytes = await readBytes(request, limit);
  try { return JSON.parse(bytes.toString("utf8")); } catch { throw new ContractError(); }
}
function equal(a, b) { const x = Buffer.from(a || ""), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); }
async function createHttp({ credential, route }) {
  const server = http.createServer(async (request, response) => {
    try {
      if (!equal(request.headers.authorization, "Bearer " + credential)) throw new ContractError("UNAUTHORIZED", 401);
      const url = new URL(request.url, "http://127.0.0.1");
      if (!url.pathname.startsWith("/snap/api/")) throw new ContractError("NOT_FOUND", 404);
      await route(request, response, url);
    } catch (error) {
      if (!response.headersSent) json(response, error instanceof ContractError ? error.status : 500, publicError(error));
      else response.destroy();
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  // Avoid fetch-blocked ports even on Windows hosts with a broad dynamic range.
  await require("./listen.cjs").listenAutomatic(server);
  if (!server.listening) throw new ContractError("NOT_READY", 503);
  return server;
}
module.exports = { createHttp, json, body, readBytes, publicError };
