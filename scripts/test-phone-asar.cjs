// Independent test archive, not a distributable installer or performance result.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const { serviceTestArchive } = require("./service-test-asar.cjs");
async function main() {
  const root = path.resolve(__dirname, ".."), base = path.join(root, ".test-data/node-service-m2"); fs.mkdirSync(base, { recursive: true });
  const run = fs.mkdtempSync(path.join(base, "archive-")), archive = await serviceTestArchive(root, run, { main: "tests/phone/main.cjs" });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-phone-")), external = path.join(temporary, "独立 空格.资源"); fs.mkdirSync(external);
  try {
    const file = path.join(external, "app.asar"); fs.copyFileSync(archive.file, file);
    const env = { ...process.env, SNAP_PHONE_TEST_ASAR: file }; delete env.NODE_PATH; delete env.NODE_OPTIONS; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(process.execPath, [path.join(root, "node_modules/@playwright/test/cli.js"), "test", "--config", "playwright.phone.config.cjs", "chat.spec.cjs", "composer.spec.cjs", "--output", path.join(run, "results"), "--reporter", "json"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = fs.createWriteStream(path.join(run, "browser.json")), stderr = fs.createWriteStream(path.join(run, "browser.log")); child.stdout.pipe(stdout); child.stderr.pipe(stderr);
    const finished = Promise.all([new Promise(resolve => stdout.once("finish", resolve)), new Promise(resolve => stderr.once("finish", resolve))]);
    const code = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); }); await finished;
    const report = JSON.parse(fs.readFileSync(path.join(run, "browser.json"), "utf8"));
    const passed = code === 0 && report.stats.unexpected === 0 && report.stats.skipped === 0 && report.stats.flaky === 0;
    const result = { status: passed ? "passed" : "failed", kind: "test-asar-only", platform: process.platform, arch: process.arch, outsideRepository: true, differentCwd: true, nodePathCleared: true, archive: { ...archive, file: path.relative(root, archive.file) }, stats: report.stats, evidence: path.relative(root, run) };
    fs.writeFileSync(path.join(run, "report.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ status: result.status, stats: result.stats, evidence: result.evidence })); if (!passed) process.exitCode = 1;
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
