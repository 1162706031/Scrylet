// First-use seeds are local input only; never contact a provider during setup.
const fs = require("node:fs"),
  path = require("node:path");
const { validate, ContractError } = require("../contracts/validate.cjs");
const { writeJson } = require("../service/migrations/common.cjs");
const catalog = require("../config/providers.json");
function read(directory, name) {
  const file = path.join(directory, name);
  if (!fs.existsSync(file)) return {};
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw new ContractError("MIGRATION_FAILED", 409);
  }
}
async function importConnectionSeeds(
  runtime,
  { directory, legacyDirectory, env = process.env },
) {
  const marker = path.join(directory, "connection-bootstrap.json");
  if (fs.existsSync(marker)) {
    const value = read(directory, "connection-bootstrap.json");
    if (
      value.schemaVersion !== 1 ||
      value.status !== "validated" ||
      Object.keys(value).length !== 2
    )
      throw new ContractError("MIGRATION_FAILED", 409);
    return;
  }
  const connections = (await runtime.providers()).providers;
  // Full legacy import / explicit saves and deletion tombstones take precedence.
  const untouched = connections.filter((p) => p.revision === 0);
  if (untouched.length) {
    const keys = legacyDirectory ? read(legacyDirectory, "api_keys.json") : {};
    const proxy = legacyDirectory
      ? read(legacyDirectory, "proxy_api.json")
      : {};
    const changes = [];
    for (const current of untouched) {
      const provider = catalog.providers.find((p) => p.id === current.id);
      const key = env[provider.envKey] || keys[provider.legacyKey] || "";
      if (typeof key !== "string")
        throw new ContractError("MIGRATION_FAILED", 409);
      const baseUrl =
        (proxy.enabled && proxy.apis?.[provider.id]) || current.baseUrl;
      if (!key && baseUrl === current.baseUrl) continue;
      changes.push(
        validate("providerChange", {
          apiVersion: 1,
          providerId: current.id,
          revision: 0,
          baseUrl,
          apiType: current.apiType,
          modelIds: current.models,
          keyAction: key.trim() ? "set" : "keep",
          ...(key.trim() ? { apiKey: key.trim() } : {}),
        }),
      );
    }
    for (const change of changes)
      await runtime.saveProvider(change.providerId, change);
  }
  writeJson(marker, { schemaVersion: 1, status: "validated" });
}
function readPromptSeeds(directory, legacyDirectory) {
  if (!legacyDirectory || fs.existsSync(path.join(directory, "connection-bootstrap.json")) || fs.existsSync(path.join(directory, "chat-node/v1/migration.json"))) return undefined;
  const file = path.join(legacyDirectory, "prompts.json");
  if (!fs.existsSync(file)) return undefined;
  if (fs.statSync(file).size > 1000000) throw new ContractError("MIGRATION_FAILED", 409);
  const source = read(legacyDirectory, "prompts.json");
  return Object.fromEntries(Object.entries(source).filter(([, value]) => typeof value?.content === "string").map(([key, value]) => [key, { name: String(value.name || key), content: value.content }]));
}
module.exports = { importConnectionSeeds, readPromptSeeds };
