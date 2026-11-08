const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  os = require("node:os");
const { ContractError } = require("../../contracts/validate.cjs");
const fail = () => {
  throw new ContractError("MIGRATION_FAILED", 409);
};
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function json(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    fail();
  }
}
function safeId(value) {
  if (typeof value !== "string" || !value.length) fail();
  return /^[A-Za-z0-9_-]{1,160}$/.test(value)
    ? value
    : "legacy_" + digest(value).slice(0, 48);
}
function milliseconds(value) {
  const n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(n * 1000))
    fail();
  return n * 1000;
}
function inside(root, file) {
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(file));
  if (
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  )
    fail();
  return file;
}
function readFile(root, file) {
  inside(root, file);
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
    fail();
  return fs.readFileSync(file);
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + "." + crypto.randomUUID() + ".pending";
  const fd = fs.openSync(temp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, canonical(value));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
}
function lease(identity) {
  const { DatabaseSync } = require("node:sqlite"),
    folder = path.join(os.tmpdir(), "scrylet-migration-leases-v1");
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(folder, digest(identity) + ".sqlite"));
  try {
    db.exec(
      "PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS lease(id INTEGER); BEGIN EXCLUSIVE;",
    );
  } catch {
    db.close();
    throw new ContractError("VERSION_CONFLICT", 409);
  }
  let open = true;
  return () => {
    if (open) {
      open = false;
      db.close();
    }
  };
}
async function publishDirectory(pending, destination, { rename = fs.renameSync, wait = require("node:timers/promises").setTimeout, platform = process.platform } = {}) {
  // Windows scanners can briefly hold a just-closed SQLite directory. Retrying
  // this atomic publication never retries model requests or replaces user data.
  const delays = [20, 50, 100, 200, 500, 1000];
  for (let attempt = 0; ; attempt++) {
    if (fs.existsSync(destination)) throw new ContractError("VERSION_CONFLICT", 409);
    try { rename(pending, destination); return; }
    catch (error) {
      if (platform !== "win32" || !["EPERM", "EBUSY", "EACCES"].includes(error.code) || attempt >= delays.length || !fs.existsSync(pending)) throw error;
      await wait(delays[attempt]);
    }
  }
}
function select(db, table) {
  const columns = db.prepare(`PRAGMA table_info("${table}")`).all(),
    statement = db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`);
  statement.setReadBigInts(true);
  return statement
    .all()
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === "bigint"
            ? key === "timer_at"
              ? value.toString()
              : Number.isSafeInteger(Number(value))
                ? Number(value)
                : fail()
            : columns.find((c) => c.name === key)?.type === "JSON" ||
                key === "value"
              ? json(value)
              : value,
        ]),
      ),
    );
}
const desktopFiles = [
  "devices.json",
  "network.json",
  "capture-settings.json",
  "bootstrap.json",
  "runtime-secret.json",
  "logs/activity.jsonl",
  "logs/activity.jsonl.1",
  "logs/activity.jsonl.2",
  "logs/activity.jsonl.3",
];
function copyDesktop(source, target) {
  for (const name of desktopFiles) {
    const from = path.join(source, name);
    if (fs.existsSync(from)) {
      fs.mkdirSync(path.dirname(path.join(target, name)), {
        recursive: true,
        mode: 0o700,
      });
      fs.writeFileSync(path.join(target, name), readFile(source, from), {
        mode: 0o600,
        flag: "wx",
      });
    }
  }
}
module.exports = {
  fail,
  digest,
  canonical,
  object,
  json,
  safeId,
  milliseconds,
  inside,
  readFile,
  writeJson,
  lease,
  select,
  desktopFiles,
  copyDesktop,
  publishDirectory,
};
