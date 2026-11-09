const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Gateway } = require("../desktop/gateway.cjs");
const { COOKIE } = require("../desktop/pairing.cjs");

test("配对前和暂停页的 Logo 与 static 源图一致，保留网关来源检查", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-brand-"));
  const gateway = new Gateway(directory, {}, { ready: false });
  await gateway.start();
  t.after(async () => { await gateway.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const url = "http://127.0.0.1:" + gateway.port;
  const source = fs.readFileSync(path.resolve(__dirname, "../static/logo.png"));
  for (const paused of [false, true]) {
    gateway.pause(paused);
    for (const route of ["/snap/assets/brand/icon.png", "/snap/assets/brand/apple-touch-icon.png"]) {
      const response = await fetch(url + route);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), source);
    }
  }
  assert.equal((await fetch(url + "/snap/assets/brand/icon.png", { headers: { Origin: "https://example.invalid" } })).status, 403);
  const invalidHost = await new Promise((resolve, reject) => {
    require("node:http").get(url + "/snap/assets/brand/icon.png", { headers: { Host: "example.invalid" } }, response => {
      response.resume(); response.on("end", () => resolve(response.statusCode));
    }).on("error", reject);
  });
  assert.equal(invalidHost, 403);
});

for (const cue of ["notification.mp3", "greeting.mp3"]) test(`旧音频地址 ${cue} 在未配对及暂停时也只返回无缓存的静音`, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-silent-audio-"));
  const gateway = new Gateway(directory, {}, { ready: false });
  await gateway.start();
  t.after(async () => { await gateway.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const url = "http://127.0.0.1:" + gateway.port + "/audio/" + cue;
  for (const paused of [false, true]) {
    gateway.pause(paused);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /audio\/wav/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const wave = Buffer.from(await response.arrayBuffer());
    assert.equal(wave.toString("ascii", 0, 4), "RIFF");
    assert.equal(wave.toString("ascii", 8, 12), "WAVE");
    assert.equal(wave.readUInt32LE(40), wave.length - 44);
    assert.ok(wave.subarray(44).length > 0);
    assert.equal(wave.subarray(44).some(sample => sample !== 0), false);
  }
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get("content-length")) > 44);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});
test("局域网网关阻止未配对、跨站和撤销设备访问系统能力", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-gateway-"));
  let captures = 0;
  const native = {
    permission: () => "granted",
    displays: () => [],
    capture: async () => {
      captures++;
      return { image: "data:image/png;base64,aGVsbG8=", displayId: "1", width: 1, height: 1 };
    },
  };
  const runtime = { ready: true };
  const gateway = new Gateway(directory, native, runtime);
  await gateway.start();
  t.after(async () => {
    await gateway.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const url = "http://127.0.0.1:" + gateway.port;
  assert.equal(
    (await fetch(url + "/snap/api/capture", { method: "POST" })).status,
    401,
  );
  assert.equal(
    (
      await fetch(url + "/api/models", {
        headers: { Accept: "application/json" },
      })
    ).status,
    401,
  );
  const code = gateway.pairing.info().token;
  let response = await fetch(url + "/snap/api/pair", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Snap-Client": "mobile",
      Origin: "https://elsewhere.test",
    },
    body: JSON.stringify({ credential: code }),
  });
  assert.equal(response.status, 403);
  response = await fetch(url + "/snap/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Snap-Client": "mobile" },
    body: JSON.stringify({ credential: code, name: "测试手机" }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.ok(cookie.startsWith(COOKIE + "="));
  const headers = {
    Cookie: cookie,
    "X-Snap-Client": "mobile",
    "Content-Type": "application/json",
    // pause/revoke deliberately destroy existing sockets. Probe the next
    // request on a fresh connection rather than an undici pooled socket.
    Connection: "close",
  };
  for (const route of ["/api/chat/completions", "/api/v1/chats/new"]) {
    const removed = await fetch(url + route, { method: "POST", headers, body: "{}" });
    assert.equal(removed.status, 410);
    assert.equal(require("../contracts/validate.cjs").validate("publicError", await removed.json()).code, "PROTOCOL_MISMATCH");
  }
  assert.equal(
    (
      await fetch(url + "/snap/api/capture", {
        method: "POST",
        headers,
        body: JSON.stringify({ displayId: "1" }),
      })
    ).status,
    200,
  );
  assert.equal(captures, 1);
  for (const route of ["/admin/settings", "/workspace/models", "/playground"]) {
    const result = await fetch(url + route, { headers, redirect: "manual" });
    assert.equal(result.status, 302);
    assert.equal(result.headers.get("location"), "/");
  }
  for (const route of [
    "/api/v1/audio/speech",
    "/api/v1/images/generations",
    "/api/v1/configs/import",
    "/api/v1/utils/code/execute",
  ]) {
    const result = await fetch(url + route, {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(result.status, 403);
  }
  gateway.pause(true);
  const pausedPage = await fetch(url + "/", { headers: { ...headers, Accept: "text/html" } });
  assert.equal(pausedPage.status, 423);
  assert.match(pausedPage.headers.get("content-type"), /text\/html/);
  assert.match(await pausedPage.text(), /connection-state/);
  assert.equal(
    (
      await fetch(url + "/snap/api/capture", {
        method: "POST",
        headers,
        body: JSON.stringify({ displayId: "1" }),
      })
    ).status,
    423,
  );
  gateway.pause(false);
  runtime.ready = false;
  const startingPage = await fetch(url + "/c/test-chat", { headers: { ...headers, Accept: "text/html" } });
  assert.equal(startingPage.status, 503);
  assert.match(await startingPage.text(), /connection-state/);
  const startingApi = await fetch(url + "/api/models", { headers: { ...headers, Accept: "text/html" } });
  assert.equal(startingApi.status, 404);
  assert.match(startingApi.headers.get("content-type"), /application\/json/);
  runtime.ready = true;
  gateway.revoke(gateway.pairing.list()[0].id);
  assert.equal(
    (
      await fetch(url + "/snap/api/capture", {
        method: "POST",
        headers,
        body: JSON.stringify({ displayId: "1" }),
      })
    ).status,
    401,
  );
  assert.equal(captures, 1);
});
test("重启复用局域网端口，被占用时重新选择", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-port-"));
  const native = { permission: () => "granted", displays: () => [] };
  const first = new Gateway(directory, native, { ready: true });
  await first.start();
  const port = first.port;
  await first.close();
  const second = new Gateway(directory, native, { ready: true });
  await second.start();
  assert.equal(second.port, port);
  const third = new Gateway(directory, native, { ready: true });
  await third.start();
  assert.notEqual(third.port, port);
  t.after(async () => {
    await second.close();
    await third.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
test("浏览器禁止的已保存端口自动回退，显式禁止端口拒绝监听", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-safe-port-"));
  fs.writeFileSync(path.join(directory, "network.json"), JSON.stringify({ port: 6668 }));
  const gateway = new Gateway(directory, { permission: () => "granted", displays: () => [] }, { ready: true });
  t.after(async () => { await gateway.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  await assert.rejects(gateway.start(6668), { code: "INVALID_PORT" });
  await gateway.start();
  assert.equal(require("../desktop/browser-ports.cjs").browserPortAllowed(gateway.port), true);
  assert.notEqual(gateway.port, 6668);
});

test("安装目录包含点目录时仍能打开配对、模型设置旧址跳转、裁剪资源和等待页", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-hidden-path-"));
  const root = path.join(directory, ".apps", "Installed Client");
  fs.mkdirSync(root, { recursive: true });
  const source = path.resolve(__dirname, "..");
  for (const name of ["desktop", "web", "static", "contracts", "service"]) fs.cpSync(path.join(source, name), path.join(root, name), { recursive: true });
  fs.copyFileSync(path.join(source, "package.json"), path.join(root, "package.json"));
  fs.mkdirSync(path.join(root, "config"));
  for (const name of ["providers.json", "product-scope.json", "appearance.json"])
    fs.copyFileSync(path.join(source, "config", name), path.join(root, "config", name));
  // The relocated gateway resolves production modules from the real workspace;
  // only these two public vendor assets belong under its own resources root.
  const { createRequire } = require("node:module");
  const originalNodePath = process.env.NODE_PATH;
  process.env.NODE_PATH = path.join(source, "node_modules");
  require("node:module").Module._initPaths();
  let HiddenGateway;
  try {
    const relocated = createRequire(path.join(root, "desktop/gateway.cjs"));
    HiddenGateway = relocated(path.join(root, "desktop/gateway.cjs")).Gateway;
    relocated("./node-gateway.cjs");
  }
  finally {
    if (originalNodePath === undefined) delete process.env.NODE_PATH;
    else process.env.NODE_PATH = originalNodePath;
    require("node:module").Module._initPaths();
  }
  const vendor = path.join(root, "node_modules/cropperjs/dist");
  fs.mkdirSync(vendor, { recursive: true });
  for (const name of ["cropper.min.js", "cropper.min.css"])
    fs.copyFileSync(path.join(source, "node_modules/cropperjs/dist", name), path.join(vendor, name));
  const runtime = { ready: false };
  const gateway = new HiddenGateway(path.join(directory, "data"), { permission: () => "granted", displays: () => [] }, runtime);
  await gateway.start();
  t.after(async () => {
    await gateway.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const url = "http://127.0.0.1:" + gateway.port;
  for (const route of ["/snap/pair", "/snap/assets/pair.js", "/snap/assets/brand/icon.png", "/snap/vendor/cropper.js", "/snap/vendor/cropper.css"])
    assert.equal((await fetch(url + route)).status, 200, route);
  const paired = await fetch(url + "/snap/api/pair", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Snap-Client": "mobile" },
    body: JSON.stringify({ credential: gateway.pairing.info().token }),
  });
  assert.equal(paired.status, 200);
  const headers = { Cookie: paired.headers.get("set-cookie").split(";")[0], Accept: "text/html" };
  assert.equal((await fetch(url + "/snap/models", { headers, redirect: "manual" })).status, 302);
  const waiting = await fetch(url + "/", { headers });
  assert.equal(waiting.status, 503);
  assert.match(await waiting.text(), /connection-state/);
});
