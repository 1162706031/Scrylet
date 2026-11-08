const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { StartupMetrics } = require("../desktop/startup-metrics.cjs");
const { parseOptions, assertNewBoot, distribution, summarize } = require("../scripts/startup-support.cjs");

test("启动时间只用单调时钟，拒绝任意标签、重复、倒退和非数字，快照不可改写内部状态", () => {
  let time = 100;
  const metrics = new StartupMetrics({ enabled: true, now: () => time });
  metrics.mark("app-start"); time = 101.2341; assert.equal(metrics.mark("service-spawned"), true);
  time = 101.2342; assert.equal(metrics.mark("legacy-http-healthy"), true);
  assert.equal(metrics.mark("api-key-test-private"), false);
  assert.equal(metrics.mark("service-spawned"), false);
  time = 99; assert.equal(metrics.mark("storage-ready"), false);
  time = NaN; assert.equal(metrics.mark("storage-ready"), false);
  time = 102; metrics.mark("storage-ready"); metrics.mark("service-ready");
  const snapshot = metrics.snapshot(); snapshot.phases[0].phase = "test-private";
  assert.equal(metrics.snapshot().phases[0].phase, "app-start");
  assert.deepEqual(metrics.snapshot().phases.map(p => p.elapsedMs), [0, 1.234, 1.234, 2, 2]);
  assert.equal(JSON.stringify(metrics.snapshot()).includes("private"), false);
});

test("本地观察协议固定顺序和枚举，默认关闭，不接受数据或时间戳注入", () => {
  const off = new StartupMetrics(); assert.equal(off.mark("app-start"), false);
  assert.throws(() => off.observe("phone-interactive")); assert.deepEqual(off.snapshot().phases, []);
  const metrics = new StartupMetrics({ enabled: true });
  assert.throws(() => metrics.observe("usable"));
  assert.throws(() => metrics.observe({ phase: "phone-interactive", url: "test-private" }));
  metrics.mark("app-start"); metrics.mark("service-ready");
  for (const phase of ["phone-interactive", "usable", "answer-visible", "answer-completed"]) metrics.observe(phase);
  metrics.observe("answer-completed");
  assert.equal(metrics.snapshot().phases.length, 6);
});

test("重启采样拒绝当前启动周期已有温启动或失败样本，空组不输出伪造零延迟", () => {
  assert.throws(() => assertNewBoot([{ bootId: "boot-a", kind: "process-restart" }], { id: "boot-a" }));
  assert.throws(() => assertNewBoot([{ bootId: "boot-a", status: "failed" }], { id: "boot-a" }));
  assert.doesNotThrow(() => assertNewBoot([{ bootId: "boot-a" }], { id: "boot-b" }));
  assert.deepEqual(distribution([]), { count: 0, medianMs: null, maxMs: null });
  assert.deepEqual(distribution([4, 1, 2, 3]), { count: 4, medianMs: 2.5, maxMs: 4 });
  const sample = (kind, bootId, status = "passed") => ({ kind, bootId, status,
    metrics: { phases: [{ phase: "service-ready", elapsedMs: 100 }] } });
  const report = summarize([
    sample("initialization", "a"), ...Array.from({ length: 10 }, () => sample("process-restart", "a")),
    ...["a", "b", "c", "d", "e"].map(boot => sample("post-system-reboot", boot)),
    sample("process-restart", "a", "failed"),
  ]);
  assert.equal(report.initialization.count, 1); assert.equal(report.processRestart.count, 10);
  assert.equal(report.failed, 1); assert.equal(report.postReboot.count, 5);
  assert.deepEqual(report.acceptance, { processRestartTen: true, distinctSystemBootsFive: true });
  assert.equal(summarize([]).postReboot.phases["usable"], undefined);
});

test("采样命令只接管 .test-data 专用子目录，单次重启采样不能冒充多次", () => {
  assert.equal(parseOptions([]).runs, 10);
  assert.equal(parseOptions(["--post-reboot"]).runs, 1);
  for (const args of [["--runs", "0"], ["--runs", "wat"], ["--directory", ".test-data"],
    ["--directory", ".test-data/../../user-data"], ["--prepare", "--post-reboot"], ["--unknown"]])
    assert.throws(() => parseOptions(args));
});

test("现有未标记目录和链接不能被采样器接管或改写", t => {
  const { claimDirectory } = require("../scripts/startup-support.cjs");
  const root = path.resolve(__dirname, "../.test-data"); fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "startup-guard-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "startup-guard-"));
  t.after(() => { fs.rmSync(directory, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); });
  fs.writeFileSync(path.join(directory, "sentinel"), "keep");
  assert.throws(() => claimDirectory(outside));
  assert.throws(() => claimDirectory(directory));
  assert.equal(fs.readFileSync(path.join(directory, "sentinel"), "utf8"), "keep");
  const link = path.join(directory, "link"); fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => claimDirectory(link)); assert.deepEqual(fs.readdirSync(outside), []);
});
