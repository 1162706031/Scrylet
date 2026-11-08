const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { validate, ContractError } = require("../contracts/validate.cjs");
const catalog = require("../config/providers.json");
let sdkPromise;
function sdk() {
  if (__filename.includes(".asar" + require("node:path").sep) && ["ai", "@ai-sdk/openai", "@ai-sdk/openai-compatible"].some(name => !require.resolve(name).includes(".asar" + require("node:path").sep))) throw new ContractError("PROTOCOL_MISMATCH", 503);
  return sdkPromise ||= Promise.all(["ai", "@ai-sdk/openai", "@ai-sdk/openai-compatible"].map(name => import(pathToFileURL(require.resolve(name)).href)))
    .then(([core, openai, compatible]) => ({ ...core, ...openai, ...compatible }));
}
class Providers {
  constructor(storage, secrets, { fetch: request = fetch } = {}) {
    this.storage = storage; this.db = storage.db; this.secrets = secrets;
    this.fetch = (input, options) => request(input, { ...options, redirect: "error" }); this.updates = Promise.resolve();
    storage.transaction(() => {
      for (const p of catalog.providers) this.db.prepare("INSERT OR IGNORE INTO provider_connections(provider_id,revision,base_url,api_type,model_ids) VALUES(?,0,?,?,?)")
        .run(p.id, p.baseUrl, p.apiType, JSON.stringify(p.models));
    });
  }
  row(id) { const row = this.db.prepare("SELECT * FROM provider_connections WHERE provider_id=?").get(id); if (!row) throw new ContractError("NOT_FOUND", 404); return row; }
  legacyModels() { return JSON.parse(this.db.prepare("SELECT value FROM product_state WHERE key='legacy-models'").get()?.value || "[]"); }
  /** @returns {import('../contracts/index').ProviderCatalogView} */
  directory() {
    return { verifiedAt: catalog.verifiedAt, providers: catalog.providers.map(p => {
      const row = this.row(p.id);
      return { id: p.id, name: p.name, source: p.source, models: JSON.parse(row.model_ids), baseUrl: row.base_url,
        configured: Boolean(row.enabled && !row.deleted && row.secret_ref), revision: row.revision, apiType: row.api_type };
    }) };
  }
  /** @returns {import('../contracts/index').PublicModel[]} */
  models() {
    const imported = this.legacyModels(), result = new Map();
    for (const p of this.directory().providers) {
      for (const model of p.models) {
        const id = p.id + "." + model, custom = imported.find(m => m.id === id);
        if (custom && !custom.active) continue;
        result.set(id, validate("publicModel", { id, providerId: p.id, name: custom?.name || catalog.providers.find(c => c.id === p.id).labels?.[model] || model, vision: custom?.vision ?? true, configured: p.configured }));
      }
      for (const custom of imported.filter(m => m.providerId === p.id && m.active && p.models.includes(m.upstreamModel))) result.set(custom.id, validate("publicModel", { id: custom.id, providerId: p.id, name: custom.name, vision: custom.vision, configured: p.configured }));
    }
    return [...result.values()];
  }
  resolve(modelId) {
    const custom = this.legacyModels().find(m => m.id === modelId);
    const p = catalog.providers.find(p => custom ? p.id === custom.providerId : modelId.startsWith(p.id + "."));
    if (!p) throw new ContractError("NOT_FOUND", 404);
    const row = this.row(p.id), upstreamModel = custom?.upstreamModel || modelId.slice(p.id.length + 1);
    if (custom && !custom.active) throw new ContractError("NOT_FOUND", 404);
    if (!JSON.parse(row.model_ids).includes(upstreamModel)) throw new ContractError("NOT_FOUND", 404);
    if (!row.enabled || row.deleted || !row.secret_ref) throw new ContractError("NOT_READY", 503);
    return { providerId: p.id, upstreamModel, row, params: custom?.params || {} };
  }
  modelOptions(modelId, messages) {
    const { params, providerId, row } = this.resolve(modelId), settings = {};
    for (const [old, name] of Object.entries({ temperature: "temperature", top_p: "topP", max_tokens: "maxOutputTokens", frequency_penalty: "frequencyPenalty", presence_penalty: "presencePenalty", seed: "seed" })) if (params[old] !== undefined && params[old] !== null) {
      if (typeof params[old] !== "number" || !Number.isFinite(params[old])) throw new ContractError("MIGRATION_FAILED", 409); settings[name] = params[old];
    }
    if (params.system !== undefined && typeof params.system !== "string") throw new ContractError("MIGRATION_FAILED", 409);
    if (params.stop !== undefined && params.stop !== null) settings.stopSequences = typeof params.stop === "string" ? [params.stop] : params.stop;
    // The compatible adapter warns and discards generic topK. Its documented
    // provider-specific passthrough retains the original Open WebUI wire field.
    if (params.top_k !== undefined && params.top_k !== null) {
      if (row.api_type !== "chat" || !Number.isSafeInteger(params.top_k) || params.top_k < 1) throw new ContractError("MIGRATION_FAILED", 409);
      settings.providerOptions = { [providerId]: { top_k: params.top_k } };
    }
    return { ...settings, messages: params.system ? [{ role: "system", content: params.system }, ...messages] : messages };
  }
  /** @param {string} id @param {unknown} value @returns {Promise<{success: true}>} */
  save(id, value) {
    const v = validate("providerChange", value);
    if (v.providerId !== id || !catalog.providers.some(p => p.id === id)) return Promise.reject(new ContractError());
    const update = this.updates.then(() => this.write(v)); this.updates = update.catch(() => {}); return update;
  }
  async write(v) {
    const old = this.row(v.providerId);
    if (old.revision !== v.revision) throw new ContractError("VERSION_CONFLICT", 409);
    // Saved connection model IDs are upstream IDs, including any literal dots.
    const models = v.modelIds;
    if (models.some(id => !id.length) || new Set(models).size !== models.length) throw new ContractError();
    let ref = old.secret_ref;
    if (v.keyAction === "set") {
      ref = v.providerId + "_" + crypto.randomUUID();
      await this.secrets({ operation: "set", providerId: v.providerId, secretRef: ref, value: v.apiKey.trim() });
    } else if (v.keyAction === "delete") ref = null;
    try {
      this.storage.transaction(() => {
        this.db.prepare("UPDATE provider_connections SET revision=revision+1,base_url=?,api_type=?,model_ids=?,secret_ref=?,deleted=?,enabled=? WHERE provider_id=?")
          .run(v.baseUrl.replace(/\/+$/, ""), v.apiType, JSON.stringify(models), ref, Number(v.keyAction === "delete" || (v.keyAction === "keep" && old.deleted)), Number(Boolean(ref)), v.providerId);
        if (old.secret_ref && old.secret_ref !== ref) this.db.prepare("INSERT OR IGNORE INTO pending_secret_deletes VALUES(?,?)").run(v.providerId, old.secret_ref);
      });
    } catch (error) { if (v.keyAction === "set") await this.secrets({ operation: "delete", providerId: v.providerId, secretRef: ref }); throw error; }
    await this.flushDeletes();
    return { success: true };
  }
  async flushDeletes() {
    for (const row of this.db.prepare("SELECT * FROM pending_secret_deletes").all()) {
      await this.secrets({ operation: "delete", providerId: row.provider_id, secretRef: row.secret_ref });
      this.db.prepare("DELETE FROM pending_secret_deletes WHERE secret_ref=?").run(row.secret_ref);
    }
  }
  async model(modelId) {
    const { providerId, upstreamModel, row } = this.resolve(modelId);
    const key = await this.secrets({ operation: "get", providerId, secretRef: row.secret_ref });
    if (!key) throw new ContractError("STORAGE_FAILED", 503);
    const library = await sdk(), options = { baseURL: row.base_url, apiKey: key, fetch: this.fetch };
    return row.api_type === "responses" ? library.createOpenAI(options).responses(upstreamModel)
      : library.createOpenAICompatible({ ...options, name: providerId })(upstreamModel);
  }
  async stream(modelId, messages, signal) {
    const apiType = this.resolve(modelId).row.api_type, model = await this.model(modelId), library = await sdk();
    // These are server-assembled, persisted ancestor messages and product
    // instructions; the public submit boundary accepts no system-role input.
    return library.streamText({ model, ...this.modelOptions(modelId, messages), allowSystemInMessages: true, abortSignal: signal, maxRetries: 0, onError: () => {},
      ...(apiType === "responses" ? { providerOptions: { openai: { store: false } } } : {}) });
  }
  async generate(modelId, messages, signal) {
    const apiType = this.resolve(modelId).row.api_type, model = await this.model(modelId), library = await sdk();
    return library.generateText({ model, ...this.modelOptions(modelId, messages), allowSystemInMessages: true, abortSignal: signal, maxRetries: 0,
      ...(apiType === "responses" ? { providerOptions: { openai: { store: false } } } : {}) });
  }
}
module.exports = { Providers };
