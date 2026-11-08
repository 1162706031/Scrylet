const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const s = JSON.parse(fs.readFileSync(path.join(process.argv[2], "database.json"), "utf8"));
const db = new DatabaseSync(":memory:");
try {
  // Selected schema fixture has no auth/user rows. FK definitions are retained,
  // but full-user referential validation belongs to the M4 isolated importer.
  db.exec("PRAGMA foreign_keys=OFF");
  for (const [name, table] of Object.entries(s.tables)) {
    db.exec(table.sql);
    const names = table.columns.map(c => c.name);
    const query = db.prepare(`INSERT INTO "${name}" (${names.map(n => '"' + n + '"').join(',')}) VALUES (${names.map(() => '?').join(',')})`);
    for (const row of table.rows) query.run(...names.map(name => {
      const v = row[name]; return v !== null && table.columns.find(c => c.name === name).type === "JSON" ? JSON.stringify(v) : typeof v === "boolean" ? Number(v) : v;
    }));
  }
  for (const [name, table] of Object.entries(s.tables)) {
    const rows = db.prepare(`SELECT * FROM "${name}" ORDER BY 1`).all().map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
      [key, value !== null && table.columns.find(c => c.name === key).type === "JSON" ? JSON.parse(value) : value])));
    assert.deepEqual(rows, table.rows);
  }
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  console.log(JSON.stringify({ tables: 7, normalizedMessages: db.prepare("SELECT count(*) AS n FROM chat_message").get().n }));
} finally { db.close(); }
