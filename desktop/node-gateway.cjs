const express = require("express");
const { endpoint } = require("../contracts/endpoints.cjs");
const { validate, ContractError } = require("../contracts/validate.cjs");
const { publicError } = require("../service/http.cjs");
function failure(response, error) { response.status(error instanceof ContractError ? error.status : 400).json(publicError(error)); }
function mountNodeGateway(app, gateway) {
  app.get(/^\/api\/v1\/files\/([A-Za-z0-9_-]+)\/content$/, (request, response) => {
    try {
      if (Object.keys(request.query).length) throw new ContractError();
      // This handler runs after the shared pairing / pause / origin checks.
      request.url = request.originalUrl = "/snap/api/legacy/files/" + request.params[0] + "/content";
      gateway.runtime.proxy(request, response, request.device.id);
    } catch (error) { failure(response, error); }
  });
  const forward = (request, response, value) => {
    try { gateway.runtime.proxy(request, response, request.device.id, value); }
    catch (error) { failure(response, error); }
  };
  app.post(/^\/snap\/api\/chats\/[A-Za-z0-9_-]+\/messages$/, express.json({ limit: "2mb" }), (request, response) => {
    try {
      if (request.headers["x-snap-client"] !== "mobile") throw new ContractError("FORBIDDEN", 403);
      if (!gateway.runtime.ready) throw new ContractError("NOT_READY", 503);
      const value = validate("submitMessage", request.body);
      if (value.origin === "desktop") {
        const job = gateway.delivery.validate(request.device, value.command), receiver = gateway.delivery.receivers.get(value.command.clientId);
        if (!receiver || receiver.context !== value.command.context || job.receiver.context !== value.command.context || !receiver.active ||
            (!receiver.ready && !(receiver.reasonCode === "busy" && receiver.activeCommandId === value.command.id)) ||
            gateway.delivery.now() - receiver.seen > 4000) throw new ContractError("VERSION_CONFLICT", 409);
      }
      forward(request, response, value);
    } catch (error) { failure(response, error instanceof ContractError ? error : new ContractError("VERSION_CONFLICT", 409)); }
  });
  app.use((request, response, next) => {
    if (!request.path.startsWith("/snap/api/")) return next();
    if (!endpoint(request.method, request.path)) return response.status(404).json({ error: "接口不存在", code: "NOT_FOUND" });
    if (!["GET", "HEAD"].includes(request.method) && request.headers["x-snap-client"] !== "mobile") return response.status(403).json({ error: "不允许此操作", code: "FORBIDDEN" });
    const length = Number(request.headers["content-length"] || 0);
    if (length > 20 * 1024 * 1024) { request.resume(); return response.status(413).json({ error: "请求内容过大", code: "TOO_LARGE" }); }
    forward(request, response);
  });
}
module.exports = { mountNodeGateway };
