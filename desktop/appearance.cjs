const path = require("node:path");
const { readJson, writeJson } = require("./pairing.cjs");
const { validate, ContractError } = require("../contracts/validate.cjs");
const catalog = require("../config/appearance.json");

// One computer-wide preference; phone clients have read-only access to its ID.
class Appearance {
  constructor(directory) {
    this.file = path.join(directory, "appearance.json");
    try { this.value = validate("appearance", readJson(this.file, { apiVersion: 1, themeId: catalog.defaultTheme, revision: 0 })); }
    catch { this.value = { apiVersion: 1, themeId: catalog.defaultTheme, revision: 0 }; }
  }
  snapshot() { return { ...this.value }; }
  save(input) {
    const change = validate("appearanceChange", input);
    if (change.themeId === this.value.themeId) return this.snapshot();
    const next = validate("appearance", { apiVersion: 1, themeId: change.themeId, revision: this.value.revision + 1 });
    try { writeJson(this.file, next); }
    catch { throw new ContractError("STORAGE_FAILED", 503); }
    this.value = next;
    return this.snapshot();
  }
}
module.exports = { Appearance, themes: catalog.themes };
