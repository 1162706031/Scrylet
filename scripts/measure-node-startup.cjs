// Actual Electron application and real persisted UI work. Models stay on loopback.
const fs = require("node:fs"),
  path = require("node:path"),
  net = require("node:net");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const { _electron, chromium, expect } = require("@playwright/test");
const { protocolProvider } = require("../tests/fixtures/protocol-provider.cjs");
const {
  bootInfo,
  assertNewBoot,
  distribution,
  systemInfo,
} = require("./startup-support.cjs");
const root = path.resolve(__dirname, "..");
function parse(argv) {
  const options = { runs: 10 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--post-reboot") {
      options.postReboot = true;
      continue;
    }
    const key = {
      "--executable": "executable",
      "--directory": "directory",
      "--runs": "runs",
    }[argv[i]];
    if (!key || !argv[i + 1]) throw Error("NODE_STARTUP_ARGUMENTS");
    options[key] = argv[++i];
  }
  options.runs = Number(options.runs);
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 100)
    throw Error("NODE_STARTUP_ARGUMENTS");
  if (options.executable) options.executable = path.resolve(options.executable);
  if (options.directory) {
    options.directory = path.resolve(options.directory);
    const testRoot = fs.realpathSync(path.join(root, ".test-data")),
      parent = fs.realpathSync(path.dirname(options.directory));
    const relative = path.relative(testRoot, parent);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw Error("测量只允许独立 .test-data 子目录");
  }
  if (options.postReboot && !options.directory)
    throw Error("重启首启采样必须指定先前准备的 --directory");
  return options;
}
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
};
function tree(pid) {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId) | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8", timeout: 15000, windowsHide: true },
  );
  if (result.status !== 0) throw Error("PROCESS_TREE_UNVERIFIED");
  const rows = JSON.parse(result.stdout),
    ids = new Set([pid]);
  let previous;
  do {
    previous = ids.size;
    for (const row of rows)
      if (ids.has(row.ParentProcessId)) ids.add(row.ProcessId);
  } while (previous !== ids.size);
  return [...ids];
}
function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    const end = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => end(true));
    socket.once("timeout", () => end(true));
    socket.once("error", () => end(false));
  });
}
function summarize(samples) {
  return Object.fromEntries(
    ["initialization", "process-restart", "post-system-reboot"].map((kind) => {
      const selected = samples.filter(
          (s) => s.kind === kind && s.status === "passed",
        ),
        points = {};
      for (const sample of selected)
        for (const point of sample.metrics.phases)
          (points[point.phase] ||= []).push(point.elapsedMs);
      return [
        kind,
        {
          count: selected.length,
          phases: Object.fromEntries(
            Object.entries(points).map(([name, values]) => [
              name,
              distribution(values),
            ]),
          ),
        },
      ];
    }),
  );
}
async function main(argv = process.argv.slice(2)) {
  if (process.platform !== "win32")
    throw Error("当前 Node 启动测量仅在真实 Windows 验收；没有自动重启操作");
  const options = parse(argv),
    base = path.join(root, ".test-data/node-service-m5");
  fs.mkdirSync(base, { recursive: true });
  const directory =
    options.directory || fs.mkdtempSync(path.join(base, "startup-"));
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "report.json");
  let report = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
  const identity = options.executable
    ? crypto
        .createHash("sha256")
        .update(
          fs.readFileSync(
            path.join(path.dirname(options.executable), "resources/app.asar"),
          ),
        )
        .digest("hex")
    : null;
  if (!report && fs.readdirSync(directory).length)
    throw Error("不接管没有测量报告的已有目录");
  if (
    report &&
    (report.schemaVersion !== 1 ||
      report.kind !== "node-startup" ||
      report.executable !== (options.executable || null) ||
      report.archiveSha256 !== identity)
  )
    throw Error("NODE_STARTUP_IDENTITY_MISMATCH");
  report ||= {
    schemaVersion: 1,
    kind: "node-startup",
    executable: options.executable || null,
    archiveSha256: identity,
    defaultEngineTested: Boolean(options.executable),
    system: systemInfo(),
    samples: [],
    realPostRebootRequired: 5,
    physicalPhone: "unverified",
    externalModelRequests: 0,
  };
  const boot = bootInfo();
  if (options.postReboot) {
    if (!report.scenario) throw Error("先准备普通启动数据，再实际重启 Windows");
    assertNewBoot(
      report.samples.filter((s) => s.kind === "post-system-reboot"),
      boot,
    );
  }
  const data = path.join(directory, "data");
  fs.mkdirSync(data, { recursive: true });
  if (!fs.existsSync(path.join(data, "capture-settings.json")))
    fs.writeFileSync(
      path.join(data, "capture-settings.json"),
      JSON.stringify({
        ...require("../desktop/capture-settings.cjs").defaults(
          path.join(directory, "no-seeds"),
        ),
        mouseEnabled: true,
        fullShortcut: "Ctrl+Alt+F8",
        regionShortcut: "Ctrl+Alt+F9",
      }),
    );
  let browser, mock;
  const save = () => {
    report.summary = summarize(report.samples);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
  };
  save();
  try {
    mock = await protocolProvider({
      answer: "启动验收：会话、草稿和模型请求正常。",
    });
    browser = await chromium.launch();
    const rounds = options.postReboot
      ? 1
      : options.runs + (report.scenario ? 0 : 1);
    for (let i = 0; i < rounds; i++) {
      const kind = options.postReboot
        ? "post-system-reboot"
        : report.scenario
          ? "process-restart"
          : "initialization";
      const sample = {
        kind,
        bootId: boot.id,
        at: new Date().toISOString(),
        status: "running",
      };
      let app,
        context,
        owned = [],
        port;
      try {
        const env = {
          ...process.env,
          SNAP_DATA_DIR: data,
          SNAP_LEGACY_DIR: path.join(directory, "no-seeds"),
          SNAP_STARTUP_METRICS: "1",
        };
        for (const key of [
          "ELECTRON_RUN_AS_NODE",
          "NODE_OPTIONS",
          "NODE_PATH",
          "SNAP_MIGRATION_SOURCE",
          "SNAP_RUNTIME_ENGINE",
        ])
          delete env[key];
        for (const provider of require("../config/providers.json").providers)
          delete env[provider.envKey];
        // Exercise the real default in both source and packaged candidates.
        // Isolation still comes from SNAP_DATA_DIR, never from a legacy fallback.
        if (!options.executable) delete env.SNAP_RUNTIME_ENGINE;
        if (options.executable)
          env.PATH =
            process.env.SystemRoot + "\\System32;" + process.env.SystemRoot;
        app = await _electron.launch({
          ...(options.executable
            ? { executablePath: options.executable, args: [] }
            : { args: [root] }),
          env,
          cwd: directory,
        });
        const desktop = await app.firstWindow();
        await expect
          .poll(
            async () => {
              const state = await desktop.evaluate(() => window.snap.state());
              if (state.error) throw Error("NODE_STARTUP_FAILED");
              return state.ready;
            },
            { timeout: 30000, intervals: [20, 50] },
          )
          .toBe(true);
        const origin = new URL(
          (await desktop.evaluate(() => window.snap.state())).baseUrl,
        );
        origin.hostname = "127.0.0.1";
        port = Number(origin.port);
        if (options.executable) {
          const proof = await app.evaluate(({ app }) => {
            const load = process
              .getBuiltinModule("module")
              .createRequire(app.getAppPath() + "/package.json");
            return {
              packaged: app.isPackaged,
              engine: process.env.SNAP_RUNTIME_ENGINE,
              metadata: load("./package.json").scryletRuntimeDefault,
              legacyLoaded: Object.keys(load.cache).some((p) =>
                /legacy-(?:runtime|gateway|paths)\.cjs$/.test(p),
              ),
            };
          });
          expect(proof.packaged).toBe(true);
          expect(proof.engine).toBeUndefined();
          expect(proof.metadata).toBe("node");
          expect(proof.legacyLoaded).toBe(false);
        }
        context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          ...(fs.existsSync(path.join(directory, "browser-state.json"))
            ? { storageState: path.join(directory, "browser-state.json") }
            : {}),
        });
        const phone = await context.newPage(),
          headers = { "X-Snap-Client": "mobile" };
        const state = await desktop.evaluate(() => window.snap.state());
        expect(
          (
            await context.request.post(origin.origin + "/snap/api/pair", {
              headers,
              data: {
                credential: new URLSearchParams(
                  new URL(state.pairingUrl).hash.slice(1),
                ).get("token"),
                name: "Node 启动计时",
              },
            })
          ).ok(),
        ).toBe(true);
        const api = async (route, body, method = body ? "POST" : "GET") => {
          const response = await context.request.fetch(origin.origin + route, {
            method,
            headers,
            ...(body ? { data: body } : {}),
          });
          expect(response.ok()).toBe(true);
          return response.json();
        };
        const provider = (await api("/snap/api/providers")).providers.find(
          (p) => p.id === "alibaba",
        );
        if (!provider.configured || provider.baseUrl !== mock.baseURL)
          await api("/snap/api/providers/alibaba", {
            apiVersion: 1,
            providerId: "alibaba",
            revision: provider.revision,
            apiType: "chat",
            baseUrl: mock.baseURL,
            keyAction: "set",
            apiKey: "synthetic-startup-only",
            modelIds: ["fixture-model"],
          });
        if (!report.scenario) {
          const chat = await api("/snap/api/chats", {
            apiVersion: 1,
            modelId: "alibaba.fixture-model",
            title: "安装版启动验收",
          });
          report.scenario = { chatId: chat.id, draftText: null };
        }
        const chatId = report.scenario.chatId;
        await phone.goto(origin.origin + "/c/" + chatId);
        await expect(phone.locator("#chat-input")).toBeVisible();
        await desktop.evaluate(() =>
          window.snap.startupObserved("phone-interactive"),
        );
        const history = await api("/snap/api/chats/" + chatId);
        if (kind !== "initialization") {
          expect(history.messages.length).toBeGreaterThan(0);
          await expect(phone.locator("#chat-input")).toHaveValue(
            report.scenario.draftText,
          );
          await expect(phone.locator(".attachment")).toHaveCount(1);
        } else {
          await phone.getByLabel("选择图片").setInputFiles({
            name: "隔离启动.png",
            mimeType: "image/png",
            buffer: require("../tests/phone/helpers.cjs").png,
          });
        }
        const question = "启动检查 " + report.samples.length;
        await phone.locator("#chat-input").fill(question);
        await expect(phone.getByText("已保存", { exact: true })).toBeVisible();
        const browserAtReady = await phone.evaluate(() => localStorage.getItem("snap.browserClientId"));
        await expect.poll(async () => (await api(`/snap/api/drafts/${chatId}?browserClientId=${browserAtReady}`)).parts.find(part => part.type === "text")?.text).toBe(question);
        await expect.poll(async () => (await api(`/snap/api/drafts/${chatId}?browserClientId=${browserAtReady}`)).parts.filter(part => part.type === "image").length).toBe(1);
        await desktop.evaluate(() => window.snap.startupObserved("usable"));
        const before = mock.requests.length;
        await phone.locator("#send-message-button").click();
        await expect.poll(() => mock.requests.length).toBe(before + 1);
        await expect(phone.locator(".message.assistant").last()).toContainText(
          "启动验收",
        );
        await desktop.evaluate(() =>
          window.snap.startupObserved("answer-visible"),
        );
        await expect(
          phone.getByRole("button", { name: "停止生成", exact: true }),
        ).toBeHidden();
        await desktop.evaluate(() =>
          window.snap.startupObserved("answer-completed"),
        );
        const latest = await api("/snap/api/chats/" + chatId);
        expect(latest.messages.length).toBe(history.messages.length + 2);
        expect(
          mock.requests
            .at(-1)
            .body.messages.some(
              (message) =>
                Array.isArray(message.content) &&
                message.content.some((part) => part.type === "image_url"),
            ),
        ).toBe(true);
        report.scenario.draftText =
          "下一次启动应恢复的图文草稿 " + report.samples.length;
        await phone.locator("#chat-input").fill(report.scenario.draftText);
        await phone.getByLabel("选择图片").setInputFiles({
          name: "保存草稿.png",
          mimeType: "image/png",
          buffer: require("../tests/phone/helpers.cjs").png,
        });
        await expect(phone.getByText("已保存", { exact: true })).toBeVisible();
        const browserId = await phone.evaluate(() =>
          localStorage.getItem("snap.browserClientId"),
        );
        await expect
          .poll(
            async () =>
              (
                await api(
                  `/snap/api/drafts/${chatId}?browserClientId=${browserId}`,
                )
              ).parts.filter((p) => p.type === "image").length,
          )
          .toBe(1);
        await context.storageState({
          path: path.join(directory, "browser-state.json"),
        });
        sample.metrics = await desktop.evaluate(() =>
          window.snap.startupMetrics(),
        );
        owned = tree(await app.evaluate(() => process.pid));
        const measured = spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "@(Get-Process -Id " +
              owned.join(",") +
              " -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64,PrivateMemorySize64) | ConvertTo-Json -Compress",
          ],
          { encoding: "utf8", windowsHide: true, timeout: 15000 },
        );
        if (measured.status !== 0) throw Error("MEMORY_SAMPLE_UNVERIFIED");
        const processes = JSON.parse(measured.stdout);
        expect(processes.some((p) => p.ProcessName === "input-observer")).toBe(
          true,
        );
        sample.memory = {
          processes: processes.length,
          workingSetBytes: processes.reduce((n, p) => n + p.WorkingSet64, 0),
          privateBytes: processes.reduce(
            (n, p) => n + p.PrivateMemorySize64,
            0,
          ),
          includesNativeObserver: true,
          workingSetSemantics:
            "sum of process working sets; shared pages may be counted more than once",
        };
        await app.evaluate(({ app }) => app.quit());
        await app.close();
        app = null;
        await expect
          .poll(() => owned.every((pid) => !alive(pid)), { timeout: 15000 })
          .toBe(true);
        await expect.poll(() => portOpen(port), { timeout: 15000 }).toBe(false);
        sample.processesExited = owned.length;
        sample.gatewayPortReleased = true;
        sample.status = "passed";
      } catch (error) {
        sample.status = "failed";
        sample.code = error.code || "NODE_STARTUP_ACCEPTANCE_FAILED";
        throw error;
      } finally {
        await app?.evaluate(({ app }) => app.quit()).catch(() => {});
        await app?.close().catch(() => {});
        await context?.close();
        report.samples.push(sample);
        save();
      }
    }
    report.status = "passed-in-measured-scope";
    report.modelRequests = mock.requests.length;
    report.postRebootSamples = report.samples.filter(
      (s) => s.kind === "post-system-reboot" && s.status === "passed",
    ).length;
    save();
    console.log(
      JSON.stringify({
        status: report.status,
        summary: report.summary,
        postRebootSamples: report.postRebootSamples,
        evidence: path.relative(root, file),
      }),
    );
    return report;
  } finally {
    await browser?.close();
    await mock?.stop();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  });
module.exports = { main, parse, summarize };
