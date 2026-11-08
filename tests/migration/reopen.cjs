const { app, safeStorage } = require("electron"),
  fs = require("node:fs"),
  path = require("node:path");
const directory = process.env.SNAP_MIGRATION_REOPEN_DIR,
  output = process.env.SNAP_MIGRATION_REOPEN_REPORT;
if (
  !directory ||
  !output ||
  !path.isAbsolute(directory) ||
  !path.isAbsolute(output)
)
  process.exit(2);
app.setPath("userData", directory);
let runtime;
app.whenReady().then(async () => {
  try {
    runtime = new (require("../../desktop/node-runtime.cjs").NodeRuntime)(
      directory,
    );
    await runtime.start();
    const { DatabaseSync } = require("node:sqlite"),
      db = new DatabaseSync(path.join(directory, "chat-node/v1/chat.sqlite"), {
        readOnly: true,
      });
    let row;
    try {
      row = db
        .prepare(
          "SELECT secret_ref FROM provider_connections WHERE provider_id='alibaba'",
        )
        .get();
    } finally {
      db.close();
    }
    const value = await require("../../desktop/secrets.cjs").createSecrets(
      directory,
      safeStorage,
    )({ operation: "get", providerId: "alibaba", secretRef: row.secret_ref });
    if (value !== "synthetic-m4-new-only") throw Error("SECRET_REOPEN_FAILED");
    await runtime.stop();
    fs.writeFileSync(
      output,
      JSON.stringify({
        status: "passed",
        realOSSecretDecryptAfterProcessRestart: true,
        nodeReady: true,
      }),
    );
    app.exit(0);
  } catch (error) {
    await runtime?.stop();
    fs.writeFileSync(
      output,
      JSON.stringify({ status: "failed", code: error.code || "REOPEN_FAILED" }),
    );
    app.exit(1);
  }
});
