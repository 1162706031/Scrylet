const fs = require("node:fs"),
  path = require("node:path");
const schema = require("./legacy-schema.json");
const {
  fail,
  digest,
  canonical,
  select,
  readFile,
  writeJson,
  copyDesktop,
} = require("./common.cjs");
function inspectSourceUnchecked(directory) {
  const { DatabaseSync } = require("node:sqlite"),
    root = fs.realpathSync(directory),
    file = path.join(root, "open-webui/webui.db");
  readFile(root, file);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      fail();
    const versions = db
      .prepare("SELECT version_num FROM alembic_version")
      .all();
    if (versions.length !== 1 || versions[0].version_num !== schema.alembic)
      fail();
    const tables = {};
    for (const [name, expected] of Object.entries(schema.tables)) {
      const columns = db
        .prepare(`PRAGMA table_info("${name}")`)
        .all()
        .map((c) => ({
          name: c.name,
          type: c.type,
          pk: c.pk,
          notnull: c.notnull,
        }));
      if (canonical(columns) !== canonical(expected.columns)) fail();
      tables[name] = select(db, name);
    }
    const users = select(db, "user");
    if (users.length !== 1) fail();
    const bytes = fs.statSync(file).size;
    return {
      root,
      file,
      identity: digest(
        process.platform === "win32" ? root.toLowerCase() : root,
      ),
      tables,
      userId: users[0].id,
      userSettings: users.map((u) => ({ id: u.id, settings: u.settings })),
      bytes,
    };
  } finally {
    db.close();
  }
}
// Only data owned by the stopped legacy runtime is snapshotted. DB backup is
// WAL-consistent; attachments/config hashes are checked again before acceptance.
async function snapshotSource(source, destination, { availableBytes } = {}) {
  const { DatabaseSync, backup } = require("node:sqlite"),
    { sourceFiles } = require("./files.cjs");
  const files = sourceFiles(source),
    estimate =
      BigInt(source.bytes) * 3n +
      files.reduce((n, f) => n + BigInt(f.bytes.length) * 2n, 0n) +
      32n * 1024n * 1024n;
  const free =
    availableBytes === undefined
      ? (() => {
          const s = fs.statfsSync(path.dirname(destination), { bigint: true });
          return s.bavail * s.bsize;
        })()
      : BigInt(availableBytes);
  if (free < estimate) fail();
  const pending =
    destination + "." + require("node:crypto").randomUUID() + ".pending";
  fs.mkdirSync(path.join(pending, "open-webui/uploads"), {
    recursive: true,
    mode: 0o700,
  });
  const db = new DatabaseSync(source.file, { readOnly: true });
  try {
    await backup(db, path.join(pending, "open-webui/webui.db"));
  } finally {
    db.close();
  }
  copyDesktop(source.root, pending);
  const snapshot = inspectSource(pending);
  // Resolve bytes from the original root, but rebase only the *snapshot* paths.
  const writable = new DatabaseSync(snapshot.file);
  try {
    for (const file of files) {
      const target = path.join(
        pending,
        "open-webui/uploads",
        file.id + ".image",
      );
      fs.writeFileSync(target, file.bytes, { mode: 0o600, flag: "wx" });
      writable
        .prepare("UPDATE file SET path=? WHERE id=?")
        .run(
          path.join(destination, "open-webui/uploads", file.id + ".image"),
          file.sourceId,
        );
    }
  } finally {
    writable.close();
  }
  const again = inspectSource(source.root);
  if (digest(canonical(source.tables)) !== digest(canonical(again.tables)))
    fail();
  for (const file of files)
    if (
      digest(require("./files.cjs").fileBytes(source, file.raw)) !== file.sha256
    )
      fail();
  for (const name of require("./common.cjs").desktopFiles) {
    const from = path.join(source.root, name),
      to = path.join(pending, name);
    if (
      fs.existsSync(from) !== fs.existsSync(to) ||
      (fs.existsSync(from) &&
        !readFile(source.root, from).equals(readFile(pending, to)))
    )
      fail();
  }
  fs.renameSync(pending, destination);
  const result = inspectSource(destination);
  const snapshotHash = digest(readFile(destination, result.file));
  writeJson(path.join(destination, "snapshot.json"), {
    schemaVersion: 1,
    snapshotHash,
    sourceContentHash: digest(
      canonical({ tables: source.tables, userSettings: source.userSettings }),
    ),
    sourceFiles: files.map((f) => ({ id: f.sourceId, sha256: f.sha256 })),
  });
  return { snapshotHash };
}
function inspectSource(directory) {
  try {
    return inspectSourceUnchecked(directory);
  } catch {
    fail();
  }
}
module.exports = { inspectSource, snapshotSource };
