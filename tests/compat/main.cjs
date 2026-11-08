// Isolated Electron entry. Never imported by desktop/main.cjs or production.
const { app, utilityProcess } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { createMockProvider } = require("../mock-provider.cjs");

const directory = process.env.SNAP_COMPAT_DATA_DIR;
if (!directory || !path.isAbsolute(directory)) process.exit(2);
fs.mkdirSync(directory, { recursive: true }); app.setPath("userData", directory);
const reportFile = path.join(directory, "result.json");
const output = value => fs.writeFileSync(reportFile, JSON.stringify(value, null, 2) + "\n");
let mock, child, server;

app.whenReady().then(async () => {
  mock = await createMockProvider();
  child = utilityProcess.fork(path.join(__dirname, "worker.cjs"), [], { stdio: "pipe", serviceName: "Scrylet Compatibility Probe" });
  let ready, stopped = false, lastPhase = "spawn", failedCode;
  child.stdout?.resume(); child.stderr?.resume();
  child.on("spawn", () => child.postMessage({ protocolVersion: 1, type: "initialize", mode: process.env.SNAP_COMPAT_HOLD === "1" ? "hold" : "probe",
    directory: path.join(directory, "storage"), baseURL: mock.url, secret: crypto.randomBytes(32).toString("hex"), parentPid: process.pid }));
  child.on("message", async message => {
    if (message?.protocolVersion !== 1) return;
    if (message.type === "phase") lastPhase = message.phase;
    if (message.type === "held") {
      fs.writeFileSync(path.join(directory, "held.json"), JSON.stringify({ mainPid: process.pid, childPid: child.pid })); return;
    }
    if (message.type === "failed") { failedCode = message.code; output({ status: "failed", code: failedCode }); return; }
    if (message.type === "stopped") stopped = true;
    if (message.type === "ready") {
      ready = message.result;
      child.postMessage({ protocolVersion: 1, type: "shutdown" });
    }
  });
  child.on("exit", async code => {
    if (!ready || code !== 0 || !stopped || mock.requests.length !== 2) {
      output({ status: "failed", code: failedCode || "COMPAT_WORKER_EXIT", phase: lastPhase }); await mock.stop(); app.exit(1); return;
    }
    await mock.stop();
    const applicationRoot = app.getAppPath().endsWith(".asar") ? app.getAppPath() : path.resolve(__dirname, "../..");
    const phone = path.join(applicationRoot, process.env.SNAP_COMPAT_ASAR === "1" ? "phone-dist" : "build/phone");
    server = http.createServer((request, response) => {
      let filename;
      try { filename = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname); } catch { response.writeHead(400).end(); return; }
      filename = filename.replace(/^\/snap\/phone\//, "/");
      const file = path.resolve(phone, "." + (filename === "/" ? "/compatibility.html" : filename));
      if (!file.startsWith(phone + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
      response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
      response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    output({ status: "passed", ...ready, lifecycle: { stoppedAcknowledged: stopped, exitCode: code },
      mockRequests: 2, mainAppPathInAsar: app.getAppPath().endsWith(".asar"), phoneAssetsReadable: fs.existsSync(path.join(phone, "index.html")),
      port: server.address().port });
  });
}).catch(() => { output({ status: "failed", code: "COMPAT_MAIN_FAILED" }); app.exit(1); });

app.on("before-quit", () => { child?.kill(); server?.close(); });
setTimeout(() => { output({ status: "failed", code: "COMPAT_TIMEOUT" }); child?.kill(); app.exit(2); }, 45000).unref();
