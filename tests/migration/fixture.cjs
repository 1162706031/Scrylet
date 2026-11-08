const fs = require("node:fs"),
  path = require("node:path"),
  { DatabaseSync } = require("node:sqlite");
const fixture = require("../fixtures/legacy-v1/database.json");
const { insert } = require("../../service/migrations/rollback.cjs");
async function legacyFixture(directory, baseUrl) {
  fs.mkdirSync(path.join(directory, "open-webui"), { recursive: true });
  const db = new DatabaseSync(path.join(directory, "open-webui/webui.db"));
  // Actual frozen 0.12.2 business tables, with a synthetic user identity.
  db.exec('CREATE TABLE "user" (id VARCHAR PRIMARY KEY, settings JSON)');
  db.prepare('INSERT INTO "user" VALUES (?, ?)').run("synthetic-migration-user", "{}");
  db.exec('CREATE TABLE alembic_version (version_num VARCHAR PRIMARY KEY)');
  db.prepare('INSERT INTO alembic_version VALUES (?)').run(fixture.alembic[0].version_num);
  for (const table of Object.values(fixture.tables)) db.exec(table.sql);
  db.exec("CREATE TABLE chatidtag (id VARCHAR PRIMARY KEY, chat_id VARCHAR, tag_name VARCHAR, user_id VARCHAR)");
  let userId;
  try {
    userId = db.prepare('SELECT id FROM "user"').get().id;
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
    for (const [table, data] of Object.entries(fixture.tables)) {
      if (table !== "config") db.exec(`DELETE FROM "${table}"`);
      for (const raw of data.rows) {
        const row = { ...raw };
        if (Object.hasOwn(row, "user_id")) row.user_id = userId;
        if (table === "file") {
          const f = fixture.attachments.find((f) => f.fileId === row.id),
            file = path.join(
              directory,
              "open-webui/uploads",
              row.id + ".image",
            );
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, Buffer.from(f.base64, "base64"));
          row.path = file;
        }
        if (table === "config") {
          let value = row.value;
          if (row.key === "openai.api_keys")
            value = value.map((_key, i) =>
              i === 3 ? "synthetic-m4-old-only" : "",
            );
          if (row.key === "openai.api_base_urls")
            value = value.map((url, i) => (i === 3 ? baseUrl : url));
          if (row.key === "openai.api_configs")
            value = Object.fromEntries(
              Object.entries(value).map(([i, c]) => [
                i,
                { ...c, enable: i === "3" },
              ]),
            );
          db.prepare(
            "INSERT INTO config(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
          ).run(row.key, JSON.stringify(value), row.updated_at);
        } else insert(db, table, row);
      }
    }
    db.prepare('UPDATE "user" SET settings=? WHERE id=?').run(
      JSON.stringify(fixture.userSettings[0]),
      userId,
    );
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  const { Pairing } = require("../../desktop/pairing.cjs");
  const pairing = new Pairing(directory),
    token = pairing.pair(pairing.info().token, "M4 隔离手机", "127.0.0.1");
  fs.writeFileSync(
    path.join(directory, "capture-settings.json"),
    JSON.stringify({
      ...require("../../desktop/capture-settings.cjs").defaults(
        path.join(directory, "no-seeds"),
      ),
      fullShortcut: "Ctrl+Alt+F8",
      showCaptureHints: true,
    }),
  );
  fs.writeFileSync(
    path.join(directory, "api_keys.json"),
    JSON.stringify({ OpenaiApiKey: "synthetic-deleted-seed-do-not-resurrect" }),
  );
  new (require("../../desktop/activity-log.cjs").ActivityLog)(directory).record(
    "settings.saved",
  );
  fs.writeFileSync(
    path.join(directory, "synthetic-only.json"),
    '{"synthetic":true}',
  );
  return {
    directory,
    userId,
    token,
    chatId: fixture.tables.chat.rows[0].id,
    imageId: fixture.tables.file.rows[0].id,
  };
}
function cloneSource(source, target) {
  fs.cpSync(source, target, { recursive: true });
  const db = new DatabaseSync(path.join(target, "open-webui/webui.db"));
  try {
    for (const row of db.prepare("SELECT id,path FROM file").all())
      db.prepare("UPDATE file SET path=? WHERE id=?").run(
        path.join(target, "open-webui/uploads", path.basename(row.path)),
        row.id,
      );
  } finally {
    db.close();
  }
  return target;
}
module.exports = { legacyFixture, cloneSource, fixture };
