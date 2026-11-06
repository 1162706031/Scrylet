const http = require("node:http");
const path = require("node:path");
const express = require("express");
const httpProxy = require("http-proxy");
const QRCode = require("qrcode");
const { Pairing, COOKIE, readJson, writeJson } = require("./pairing.cjs");
const { addresses } = require("./native.cjs");
const { scope, restrict } = require("./product-scope.cjs");
const { CaptureDelivery } = require("./capture-delivery.cjs");
const { reasonFor } = require("./activity-log.cjs");
const { sendSilentAudio } = require("./silent-audio.cjs");

const ASSETS = path.resolve(__dirname, "../web");
const extension =
  '<script src="/snap/assets/quiet.js"></script><link rel="stylesheet" href="/snap/assets/mobile.css"><script type="module" src="/snap/assets/extension.js"></script>';

function unavailable(request, response, status, error) {
  const isPage = request.method === "GET" &&
    String(request.headers.accept || "").includes("text/html") &&
    !/^\/(api|snap\/api|openai|ollama)(\/|$)/.test(request.url);
  if (isPage) return response.status(status).sendFile("unavailable.html", { root: ASSETS });
  return response.status(status).json({ error });
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
    this.proxy = httpProxy.createProxyServer({
      ws: true,
      changeOrigin: true,
      selfHandleResponse: true,
    });
    this.proxy.on("error", (_error, request, response) => {
      if (typeof response?.writeHead === "function" && !response.headersSent) {
        unavailable(request, response, 502, "聊天服务暂时不可用，请查看电脑 App");
      } else response?.destroy();
    });
    this.proxy.on("proxyRes", (upstream, request, response) => {
      if (request.method === "POST" && request.url.split("?")[0] === "/api/chat/completions")
        this.activity?.record(upstream.statusCode < 400 ? "chat.requested" : "chat.failed");
      const headers = { ...upstream.headers };
      delete headers["access-control-allow-origin"];
      delete headers["access-control-allow-credentials"];
      headers["cache-control"] = "no-store";
      headers["referrer-policy"] = "no-referrer";
      headers["x-content-type-options"] = "nosniff";
      if (String(headers["content-type"]).includes("text/html")) {
        const chunks = [];
        upstream.on("data", (chunk) => chunks.push(chunk));
        upstream.on("end", () => {
          if (response.destroyed) return;
          const html = Buffer.concat(chunks)
            .toString("utf8")
            .replace("</head>", extension + "</head>");
          delete headers["content-length"];
          delete headers["content-encoding"];
          response.writeHead(upstream.statusCode, headers);
          response.end(html);
        });
      } else {
        response.writeHead(upstream.statusCode, headers);
        upstream.pipe(response);
      }
      upstream.on("error", () => response.destroy());
    });
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
          .json({ error: "请使用电脑 App 显示的局域网地址" });
      const origin = request.headers.origin;
      if (origin && origin !== "http://" + request.headers.host) {
        return response.status(403).json({ error: "不接受来自其他网站的请求" });
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
          !request.path.startsWith("/api")
        ) {
          return response.redirect("/snap/pair");
        }
        return response
          .status(401)
          .json({ error: "请重新扫描电脑 App 上的二维码" });
      }
      this.sockets.set(request.socket, device.id);
      request.device = device;
      if (this.paused && request.path !== "/snap/api/status") {
        return unavailable(request, response, 423, "电脑已暂停手机访问");
      }
      next();
    });
    this.app.get("/snap/models", (_request, response) =>
      response.sendFile("models.html", { root: ASSETS }),
    );
    this.app.get("/snap/api/status", (_request, response) =>
      response.json({
        ready: this.runtime.ready,
        paused: this.paused,
        permission: this.native.permission(),
        displays: this.native.displays(),
        error: this.runtime.error || "",
        maxImages: scope.maxImages,
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
          response.json(action(request.device, request.body));
        } catch (error) {
          response.status(400).json({ error: error.message });
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
          const capture = await this.native.capture(request.body?.displayId);
          this.activity?.record("capture.completed", { origin: "phone", width: capture.width, height: capture.height });
          response.json(capture);
        } catch (error) {
          this.activity?.record("capture.failed", { origin: "phone", reason: reasonFor(error) });
          response.status(400).json({ error: error.message });
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
        const models = await this.runtime.request("/api/models");
        response.json({ available: models.data.length > 0 });
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
          response.status(400).json({ error: error.message });
        }
      },
    );
    this.app.use(restrict);
    this.app.use((request, response) => {
      if (!this.runtime.ready)
        return unavailable(request, response, 503,
          this.runtime.error || "聊天服务正在启动，请稍后重试");
      // The single-user backend only listens on loopback. Never accept injected
      // trusted-user headers from a remote client.
      for (const header of Object.keys(request.headers)) {
        if (
          header.startsWith("x-forwarded-") ||
          header.startsWith("x-openwebui-")
        )
          delete request.headers[header];
      }
      request.headers["accept-encoding"] = "identity";
      // The gateway already checked the browser's same origin. The private
      // backend sees one stable origin, even after the computer changes Wi-Fi.
      if (request.headers.origin) request.headers.origin = this.runtime.url;
      this.proxy.web(request, response, { target: this.runtime.url });
    });
    this.app.use((error, _request, response, _next) => {
      response.status(error.status || 500).json({
        error: error.status === 413 ? "请求内容过大" : "请求格式不正确",
      });
    });
    this.server = http.createServer(this.app);
    this.server.on("connection", (socket) =>
      socket.once("close", () => this.sockets.delete(socket)),
    );
    this.server.on("upgrade", (request, socket, head) => {
      const device = this.pairing.authenticate(request.headers.cookie);
      const origin = request.headers.origin;
      if (
        !device ||
        !validHost(request) ||
        this.paused ||
        !this.runtime.ready ||
        (origin && origin !== "http://" + request.headers.host)
      ) {
        return socket.destroy();
      }
      if (request.headers.origin) request.headers.origin = this.runtime.url;
      this.sockets.set(socket, device.id);
      this.proxy.ws(request, socket, head, {
        target: this.runtime.url,
        selfHandleResponse: false,
      });
    });
  }
  async start(port = 0) {
    const saved = this.networkSettings.port;
    const preferred =
      port ||
      (Number.isInteger(saved) && saved > 1023 && saved <= 65535 ? saved : 0);
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
      if (port || error.code !== "EADDRINUSE") throw error;
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
      harness: "Open WebUI 0.12.2",
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
    this.delivery.close();
    for (const socket of this.sockets.keys()) socket.destroy();
    this.proxy.close();
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }
}
module.exports = { Gateway };
