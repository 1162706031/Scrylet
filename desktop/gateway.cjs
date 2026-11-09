const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const QRCode = require("qrcode");
const { Pairing, COOKIE, readJson, writeJson } = require("./pairing.cjs");
const { addresses } = require("./native.cjs");
const { scope, restrict } = require("./product-scope.cjs");
const { CaptureDelivery } = require("./capture-delivery.cjs");
const { reasonFor } = require("./activity-log.cjs");
const { sendSilentAudio } = require("./silent-audio.cjs");
const { validate, ContractError } = require("../contracts/validate.cjs");
const { publicError } = require("../service/http.cjs");

const ASSETS = path.resolve(__dirname, "../web");


function unavailable(request, response, status, error) {
  const isPage = request.method === "GET" &&
    String(request.headers.accept || "").includes("text/html") &&
      !/^\/(api|snap\/api|openai|ollama)(\/|$)/.test(request.url);
  if (isPage) return response.status(status).sendFile("unavailable.html", { root: ASSETS });
  return response.status(status).json({ error, ...(request.url.startsWith("/snap/api/") ? { code: ({ 401: "UNAUTHORIZED", 403: "FORBIDDEN", 423: "PAUSED", 503: "NOT_READY" })[status] || "NOT_READY" } : {}) });
}

class Gateway {
  constructor(directory, native, runtime, { activity } = {}) {
    this.activity = activity;
    this.networkFile = path.join(directory, "network.json");
    this.networkSettings = readJson(this.networkFile, {});
    this.preferredNetwork = this.networkSettings.selectedNetwork;
    this.pairing = new Pairing(directory);
    this.native = native;
    this.runtime = runtime;
    this.paused = false;
    this.selectedAddress = "";
    this.sockets = new Map();
    this.delivery = new CaptureDelivery();
    if (runtime.kind && runtime.kind !== "node") throw new Error("仅支持 Node 聊天服务");
    this.app = express();
    this.app.disable("x-powered-by");
    const validHost = (request) => {
      try {
        const host = new URL("http://" + request.headers.host).hostname;
        return [
          "127.0.0.1",
          "localhost",
          ...addresses().map((item) => item.address),
        ].includes(host);
      } catch {
        return false;
      }
    };
    this.app.use((request, response, next) => {
      if (!validHost(request))
        return response
          .status(403)
          .json({ error: "请使用电脑 App 显示的局域网地址", code: "FORBIDDEN" });
      const origin = request.headers.origin;
      if (origin && origin !== "http://" + request.headers.host) {
        return response.status(403).json({ error: "不接受来自其他网站的请求", code: "FORBIDDEN" });
      }
      response.set({
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      next();
    });
    this.app.use("/snap/assets", express.static(ASSETS, { index: false }));
    this.app.get(["/audio/notification.mp3", "/audio/greeting.mp3"], sendSilentAudio);
    this.app.get("/snap/vendor/cropper.js", (_request, response) =>
      response.sendFile("cropper.min.js", {
        root: path.resolve(
          __dirname,
          "../node_modules/cropperjs/dist",
        ),
      }),
    );
    this.app.get("/snap/vendor/cropper.css", (_request, response) =>
      response.sendFile("cropper.min.css", {
        root: path.resolve(
          __dirname,
          "../node_modules/cropperjs/dist",
        ),
      }),
    );
    this.app.get("/snap/pair", (_request, response) =>
      response.sendFile("pair.html", { root: ASSETS }),
    );
    this.app.post(
      "/snap/api/pair",
      express.json({ limit: "2kb" }),
      (request, response) => {
        if (this.paused)
          return response.status(423).json({ error: "电脑已暂停手机访问" });
        if (request.headers["x-snap-client"] !== "mobile")
          return response.sendStatus(403);
        try {
          const old = this.pairing.authenticate(request.headers.cookie);
          if (old) return response.json({ success: true });
          const token = this.pairing.pair(
            request.body.credential,
            request.body.name,
            request.socket.remoteAddress,
          );
          this.activity?.record("device.paired", { count: this.pairing.list().length });
          response.cookie(COOKIE, token, {
            httpOnly: true,
            sameSite: "strict",
            path: "/",
            maxAge: 30 * 86400000,
          });
          response.json({ success: true });
        } catch (error) {
          response.status(400).json({ error: error.message });
        }
      },
    );
    this.app.use((request, response, next) => {
      const device = this.pairing.authenticate(request.headers.cookie);
      if (!device) {
        if (
          request.method === "GET" &&
          request.accepts("html") &&
          !/^\/(?:snap\/)?api(?:\/|$)/.test(request.path)
        ) {
          return response.redirect("/snap/pair" + (/^\/c\/[A-Za-z0-9_-]+$/.test(request.path) ? "?returnTo=" + encodeURIComponent(request.path) : ""));
        }
        return response
          .status(401)
          .json({ error: "请重新扫描电脑 App 上的二维码", code: "UNAUTHORIZED" });
      }
      this.sockets.set(request.socket, device.id);
      request.device = device;
      if (this.closing) return unavailable(request, response, 503, "电脑正在退出");
      if (this.paused && request.path !== "/snap/api/status") {
        return unavailable(request, response, 423, "电脑已暂停手机访问");
      }
      next();
    });
    this.app.use(restrict);
    this.app.get("/snap/models", (_request, response) => response.redirect("/"));
    this.app.get("/snap/api/status", (_request, response) =>
      response.json({
        ready: this.runtime.ready,
        paused: this.paused,
        permission: this.native.permission(),
        displays: this.native.displays(),
        error: this.runtime.error || "",
        maxImages: scope.maxImages,
        apiVersion: 1, frontendBuild: "phone-v1-" + require("../package.json").version,
        runtimeKind: "node", migration: this.runtime.migration || "not-started", showCaptureHints: false,
      }),
    );
    for (const [route, action] of [
      ["poll", (device, data) => this.delivery.poll(device, data)],
      ["validate", (device, data) => {
        if (!this.runtime.ready || this.runtime.error) throw new Error("聊天服务尚未就绪，截图已保留在草稿中");
        this.delivery.validate(device, data);
        return { success: true };
      }],
      ["ack", (device, data) => {
        this.delivery.acknowledge(device, data);
        return { success: true };
      }],
    ]) {
      this.app.post("/snap/api/desktop/" + route, express.json({ limit: "2kb" }), (request, response) => {
        if (request.headers["x-snap-client"] !== "mobile") return response.sendStatus(403);
        try {
          validate(route === "poll" ? "desktopPoll" : route === "validate" ? "command" : "desktopAck", request.body);
          const result = action(request.device, request.body);
          response.json(route === "poll" ? validate("desktopPollResult", result) : result);
        } catch (error) {
          response.status(error instanceof ContractError ? error.status : 409).json(publicError(error instanceof ContractError ? error : new ContractError("VERSION_CONFLICT", 409)));
        }
      });
    }
    this.app.post(
      "/snap/api/capture",
      express.json({ limit: "2kb" }),
      async (request, response) => {
        if (request.headers["x-snap-client"] !== "mobile")
          return response.sendStatus(403);
        try {
          validate("captureRequest", request.body);
          const capture = await this.native.capture(request.body?.displayId);
          this.activity?.record("capture.completed", { origin: "phone", width: capture.width, height: capture.height });
          response.json(validate("capture", capture));
        } catch (error) {
          this.activity?.record("capture.failed", { origin: "phone", reason: reasonFor(error) });
          const failure = error instanceof ContractError ? error : new ContractError(this.native.permission() === "granted" ? "STORAGE_FAILED" : "FORBIDDEN", this.native.permission() === "granted" ? 503 : 403);
          response.status(failure.status).json(publicError(failure));
        }
      },
    );
    this.app.get("/snap/api/providers", async (_request, response) => {
      try {
        response.json(await this.runtime.providers());
      } catch (error) {
        response.status(503).json({ error: error.message });
      }
    });
    this.app.get("/snap/api/available-models", async (_request, response) => {
      try {
        const available = await this.runtime.availableModels();
        response.json({ available });
      } catch {
        response.status(503).json({ error: "暂时无法读取模型列表" });
      }
    });
    this.app.post(
      "/snap/api/providers/:id",
      express.json({ limit: "8kb" }),
      async (request, response) => {
        if (request.headers["x-snap-client"] !== "mobile")
          return response.sendStatus(403);
        try {
          response.json(
            await this.runtime.saveProvider(request.params.id, request.body),
          );
          this.activity?.record("provider.saved");
        } catch (error) {
          response.status(error.status || 400).json(publicError(error));
        }
      },
    );
    require("./node-gateway.cjs").mountNodeGateway(this.app, this);
    {
      const root = path.resolve(__dirname, ".."), phone = fs.existsSync(path.join(root, "phone-dist/index.html")) ? path.join(root, "phone-dist") : path.join(root, "build/phone");
      this.app.use("/snap/phone", express.static(phone, { index: false }));
      this.app.get(/^\/(?:c\/[A-Za-z0-9_-]+)?$/, (_request, response) => {
        if (!this.runtime.ready) return unavailable(_request, response, 503, "聊天服务尚未就绪");
        if (!fs.existsSync(path.join(phone, "index.html"))) return response.status(503).send("手机页面尚未构建，请在电脑运行 build:phone。");
        response.sendFile("index.html", { root: phone });
      });
    }
    this.app.use((request, response) => {
      if (["/api/chat/completions", "/api/v1/chats/new"].includes(request.path))
        return response.status(410).json(validate("publicError", { error: "页面已升级，请刷新后重试", code: "PROTOCOL_MISMATCH" }));
      return response.status(404).json({ error: "接口不存在", code: "NOT_FOUND" });
    });

    this.app.use((error, _request, response, _next) => {
      response.status(error.status || 500).json({
        error: error.status === 413 ? "请求内容过大" : "请求格式不正确",
        code: error.status === 413 ? "TOO_LARGE" : "INVALID_CONTRACT",
      });
    });
    this.server = http.createServer(this.app);
    this.server.on("connection", (socket) =>
      socket.once("close", () => this.sockets.delete(socket)),
    );
    // The authenticated Node transport uses HTTP/SSE, never legacy WebSockets.
    this.server.on("upgrade", (_request, socket) => socket.destroy());
  }
  async start(port = 0) {
    const { browserPortAllowed } = require("./browser-ports.cjs");
    if (port && !browserPortAllowed(port)) throw Object.assign(new Error("此端口被浏览器禁止，请选择其他局域网端口"), { code: "INVALID_PORT" });
    const saved = this.networkSettings.port;
    const preferred =
      port ||
      (Number.isInteger(saved) && saved > 1023 && browserPortAllowed(saved) ? saved : 0);
    const listen = (value) =>
      new Promise((resolve, reject) => {
        const failed = (error) => {
          this.server.removeListener("listening", ready);
          reject(error);
        };
        const ready = () => {
          this.server.removeListener("error", failed);
          resolve();
        };
        this.server
          .once("error", failed)
          .once("listening", ready)
          .listen(value, "0.0.0.0");
      });
    try {
      await listen(preferred);
    } catch (error) {
      if (port || (error.code !== "EADDRINUSE" && !(process.platform === "win32" && error.code === "EACCES"))) throw error;
      await listen(0);
    }
    for (let attempt = 0; !browserPortAllowed(this.server.address().port); attempt++) {
      await new Promise((resolve, reject) => this.server.close(error => error ? reject(error) : resolve()));
      if (attempt >= 15) throw Object.assign(new Error("未找到浏览器可用的局域网端口"), { code: "INVALID_PORT" });
      await listen(0);
    }
    this.port = this.server.address().port;
    this.saveNetwork();
    return this.port;
  }
  saveNetwork() {
    writeJson(this.networkFile, {
      ...this.networkSettings, port: this.port,
      ...(this.preferredNetwork ? { selectedNetwork: this.preferredNetwork } : {}),
    });
  }
  selectNetwork(address) {
    const network = addresses().find((item) => item.address === address);
    if (!network) throw new Error("网络地址已失效，请刷新");
    const previous = this.preferredNetwork;
    this.preferredNetwork = { name: network.name, address: network.address };
    try { this.saveNetwork(); } catch (error) {
      this.preferredNetwork = previous;
      throw error;
    }
  }
  async state() {
    const networks = addresses();
    const preferred = this.preferredNetwork;
    // Remember the adapter as well as its address, so DHCP changes still use
    // the chosen network. A disconnected preference falls back without erasing it.
    const selected = networks.find((item) => item.name === preferred?.name && item.address === preferred?.address) ||
      networks.find((item) => item.name === preferred?.name) || networks[0];
    const selectedAddress = selected?.address || "127.0.0.1";
    this.selectedAddress = selectedAddress;
    const baseUrl = "http://" + selectedAddress + ":" + this.port;
    const pairing = this.pairing.info();
    const url = baseUrl + "/snap/pair#token=" + pairing.token;
    let qr = this.qrUrl === url ? this.qr : null;
    if (!qr) {
      qr = await QRCode.toDataURL(url, {
        width: 280,
        margin: 2,
        color: { dark: "#192c27", light: "#ffffff" },
      });
      this.qr = qr;
      this.qrUrl = url;
    }
    return {
      ready: this.runtime.ready,
      error: this.runtime.error,
      paused: this.paused,
      networks,
      selectedAddress,
      baseUrl,
      pairingUrl: url,
      code: pairing.code,
      expiresAt: pairing.expiresAt,
      qr,
      devices: this.pairing.list(),
      permission: this.native.permission(),
      platform: process.platform,
      harness: "Node Chat Service",
      runtimeKind: "node",
    };
  }
  revoke(id) {
    this.activity?.record("device.revoked");
    this.pairing.revoke(id);
    this.delivery.revoke(id);
    for (const [socket, owner] of this.sockets)
      if (owner === id) socket.destroy();
  }
  pause(value) {
    this.activity?.record(value ? "access.paused" : "access.resumed");
    this.paused = Boolean(value);
    if (this.paused) this.delivery.cancel("手机访问已暂停，截图发送已取消");
    if (this.paused) for (const socket of this.sockets.keys()) socket.destroy();
  }
  async close() {
    this.closing = true;
    this.delivery.close();
    for (const socket of this.sockets.keys()) socket.destroy();
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }
}
module.exports = { Gateway };
