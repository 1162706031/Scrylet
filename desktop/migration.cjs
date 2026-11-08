// Local coordinator. No renderer/phone endpoint can invoke migration or rollback.
const { spawnSync } = require("node:child_process");
const { ContractError } = require("../contracts/validate.cjs");
const { createSecrets } = require("./secrets.cjs");
function assertLegacyStopped() {
  let result;
  if (process.platform === "win32")
    result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -match '^python(?:w)?(?:3(?:\\.12)?)?\\.exe$' -and $_.CommandLine -match '(?:runtime[\\/]|[ \"])launch\\.py[ \"]' } | Select-Object -ExpandProperty ProcessId) -join ','",
      ],
      { encoding: "utf8", windowsHide: true },
    );
  else if (process.platform === "darwin")
    result = spawnSync("/bin/ps", ["-axo", "command="], { encoding: "utf8" });
  else throw new ContractError("MIGRATION_FAILED", 409);
  if (result.error || result.status !== 0)
    throw new ContractError("MIGRATION_FAILED", 409);
  const busy =
    process.platform === "win32"
      ? result.stdout.trim().length > 0
      : result.stdout
          .split("\n")
          .some((line) =>
            /python.*(?:runtime\/|\s)launch\.py(?:\s|$)/.test(line),
          );
  if (busy) throw new ContractError("VERSION_CONFLICT", 409);
}
async function migrateLegacy(
  sourceDirectory,
  targetDirectory,
  safeStorage,
  options = {},
) {
  if (
    !require("node:fs").existsSync(
      require("node:path").join(targetDirectory, "chat-node/v1/migration.json"),
    )
  )
    assertLegacyStopped();
  return require("../service/migrations/open-webui.cjs").migrateOpenWebUI({
    sourceDirectory,
    targetDirectory,
    secretsFor: (directory) => createSecrets(directory, safeStorage),
    ...options,
  });
}
async function rollbackLegacy(
  targetDirectory,
  outputDirectory,
  safeStorage,
  options = {},
) {
  assertLegacyStopped();
  return require("../service/migrations/rollback.cjs").exportRollback({
    targetDirectory,
    outputDirectory,
    secrets: createSecrets(targetDirectory, safeStorage),
    ...options,
  });
}
module.exports = { assertLegacyStopped, migrateLegacy, rollbackLegacy };
