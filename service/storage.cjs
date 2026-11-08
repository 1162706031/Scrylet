const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ContractError } = require("../contracts/validate.cjs");

class Storage {
  constructor(directory) {
    const { DatabaseSync } = require("node:sqlite");
    this.root = path.join(path.resolve(directory), "chat-node/v1");
    fs.mkdirSync(path.join(this.root, "files"), { recursive: true, mode: 0o700 });
    try {
      const dataRoot = fs.realpathSync(path.resolve(directory));
      if (!fs.realpathSync(this.root).startsWith(dataRoot + path.sep) || !fs.realpathSync(path.join(this.root, "files")).startsWith(fs.realpathSync(this.root) + path.sep)) throw new ContractError("STORAGE_FAILED", 503);
      // A separate SQLite exclusive transaction is an OS-released process lease.
      // It avoids stale PID files and keeps the actual chat DB in WAL mode.
      this.lease = new DatabaseSync(path.join(this.root, "writer.sqlite"));
      this.lease.exec("PRAGMA busy_timeout=25; CREATE TABLE IF NOT EXISTS lease(id INTEGER); BEGIN EXCLUSIVE;");
      this.db = new DatabaseSync(path.join(this.root, "chat.sqlite"));
      this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      const migrations = fs.readdirSync(path.join(__dirname, "migrations/schema")).filter(f => /^\d{3}\.sql$/.test(f)).sort().map((f, i) => {
        const sql = fs.readFileSync(path.join(__dirname, "migrations/schema", f), "utf8");
        return { version: i + 1, sql, checksum: crypto.createHash("sha256").update(sql).digest("hex") };
      });
      const exists = this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='schema_migrations'").get();
      let applied = 0;
      if (exists) {
        const versions = this.db.prepare("SELECT version,checksum FROM schema_migrations ORDER BY version").all();
        if (versions.length > migrations.length || versions.some((v, i) => v.version !== i + 1 || v.checksum !== migrations[i].checksum)) throw new ContractError("MIGRATION_FAILED", 503);
        applied = versions.length;
      }
      for (const migration of migrations.slice(applied)) this.transaction(() => {
        this.db.exec(migration.sql); this.db.prepare("INSERT INTO schema_migrations VALUES(?,?,?)").run(migration.version, migration.checksum, Date.now());
      });
      this.schemaVersion = migrations.length;
    } catch (error) { this.close(); throw error instanceof ContractError ? error : new ContractError("STORAGE_FAILED", 503); }
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      if (result?.then) throw new ContractError("STORAGE_FAILED", 503);
      this.db.exec("COMMIT"); return result;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  async backup(target) {
    const { backup } = require("node:sqlite");
    const file = path.resolve(target);
    if (path.dirname(file) !== this.root || fs.existsSync(file)) throw new ContractError();
    await backup(this.db, file); return file;
  }
  close() {
    try { this.db?.close(); } finally { this.db = null; this.lease?.close(); this.lease = null; }
  }
}
module.exports = { Storage };
