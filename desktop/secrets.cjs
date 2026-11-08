const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./pairing.cjs");
const catalog = require("../config/providers.json");
const { ContractError } = require("../contracts/validate.cjs");

// Only the main process owns OS-backed encryption. No cleartext fallback.
function createSecrets(directory, safeStorage) {
  const file = path.join(directory, "chat-node/v1/secrets.json");
  return async message => {
    const { providerId, operation, secretRef = providerId } = message;
    if (!catalog.providers.some(p => p.id === providerId) || !/^[A-Za-z0-9_-]{1,160}$/.test(secretRef) ||
        !(secretRef === providerId || secretRef.startsWith(providerId + "_"))) throw new ContractError("FORBIDDEN", 403);
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === "basic_text") throw new ContractError("STORAGE_FAILED", 503);
    const values = readJson(file, {});
    if (operation === "get") return values[secretRef] ? safeStorage.decryptString(Buffer.from(values[secretRef], "base64")) : null;
    if (operation === "set") values[secretRef] = safeStorage.encryptString(message.value).toString("base64");
    else if (operation === "delete") delete values[secretRef];
    else throw new ContractError();
    writeJson(file, values);
    if (fs.existsSync(file) && process.platform !== "win32") fs.chmodSync(file, 0o600);
    return null;
  };
}
module.exports = { createSecrets };
