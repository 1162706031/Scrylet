const catalog = require("../../config/providers.json");
const { validate } = require("../../contracts/validate.cjs");
const { fail, json, object, digest, canonical } = require("./common.cjs");
function mapConnections(source) {
  const config = Object.fromEntries(
      source.tables.config.map((row) => [row.key, row.value]),
    ),
    keys = config["openai.api_keys"],
    urls = config["openai.api_base_urls"],
    configs = config["openai.api_configs"];
  if (
    !Array.isArray(keys) ||
    !Array.isArray(urls) ||
    !object(configs) ||
    keys.length !== urls.length
  )
    fail();
  const connections = [];
  for (const [index, v] of Object.entries(configs)) {
    if (
      !object(v) ||
      !catalog.providers.some((p) => p.id === v.prefix_id) ||
      !/^\d+$/.test(index) ||
      Number(index) >= urls.length ||
      connections.some((c) => c.providerId === v.prefix_id)
    )
      fail();
    const p = catalog.providers.find((p) => p.id === v.prefix_id),
      apiKey = keys[Number(index)];
    if (typeof apiKey !== "string" || typeof v.enable !== "boolean") fail();
    const change = validate("providerChange", {
      apiVersion: 1,
      providerId: p.id,
      revision: 0,
      baseUrl: urls[Number(index)],
      apiType: v.api_type || p.apiType,
      modelIds: v.model_ids,
      keyAction: apiKey.trim() ? "set" : "delete",
      ...(apiKey.trim() ? { apiKey } : {}),
    });
    connections.push({
      ...change,
      enabled: Boolean(v.enable && apiKey.trim()),
      deleted: !apiKey.trim(),
      raw: { index, config: v },
    });
  }
  if (
    urls.some(
      (url, index) =>
        !connections.some((c) => Number(c.raw.index) === index) &&
        (url || keys[index]),
    )
  )
    fail();
  const models = source.tables.model.map((row) => {
    const base = row.base_model_id || row.id,
      provider = catalog.providers.find((p) => base.startsWith(p.id + "."));
    if (!provider) fail();
    const connection = connections.find((c) => c.providerId === provider.id);
    if (!connection) fail();
    const upstreamModel = base.slice(provider.id.length + 1),
      params = json(row.params, {}),
      meta = json(row.meta, {});
    if (!object(params) || !object(meta)) fail();
    const supported = new Set([
      "system",
      "temperature",
      "top_p",
      "top_k",
      "max_tokens",
      "frequency_penalty",
      "presence_penalty",
      "seed",
      "stop",
    ]);
    for (const [key, value] of Object.entries(params))
      if (value !== null && value !== undefined) {
        if (!supported.has(key)) fail();
        if (key === "top_k" && (connection.apiType !== "chat" || !Number.isSafeInteger(value) || value < 1)) fail();
        if (key === "system") {
          if (typeof value !== "string") fail();
        } else if (key === "stop") {
          if (
            !(
              typeof value === "string" ||
              (Array.isArray(value) &&
                value.every((v) => typeof v === "string"))
            )
          )
            fail();
        } else if (typeof value !== "number" || !Number.isFinite(value)) fail();
      }
    validate("publicModel", {
      id: row.id,
      providerId: provider.id,
      name: row.name || row.id,
      vision: meta.capabilities?.vision !== false,
      configured: false,
    });
    if (!connection.modelIds.includes(upstreamModel))
      connection.modelIds.push(upstreamModel);
    return {
      id: row.id,
      providerId: provider.id,
      upstreamModel,
      name: row.name || row.id,
      vision: meta.capabilities?.vision !== false,
      active: Boolean(row.is_active),
      params,
      raw: row,
    };
  });
  return { connections, models };
}
async function storeConnections(storage, plan, secrets, runId) {
  const values = [];
  for (const c of plan.connections) {
    const ref =
      c.keyAction === "set" ? c.providerId + "_migration_" + runId : null;
    if (ref)
      await secrets({
        operation: "set",
        providerId: c.providerId,
        secretRef: ref,
        value: c.apiKey,
      });
    values.push({ c, ref });
  }
  storage.transaction(() => {
    for (const { c, ref } of values)
      storage.db
        .prepare(
          "INSERT INTO provider_connections(provider_id,revision,base_url,api_type,model_ids,secret_ref,deleted,enabled,legacy) VALUES(?,1,?,?,?,?,?,?,?) ON CONFLICT(provider_id) DO NOTHING",
        )
        .run(
          c.providerId,
          c.baseUrl.replace(/\/+$/, ""),
          c.apiType,
          canonical(c.modelIds),
          ref,
          Number(c.deleted),
          Number(c.enabled),
          canonical(c.raw),
        );
    storage.db
      .prepare("INSERT OR REPLACE INTO product_state VALUES('legacy-models',?)")
      .run(canonical(plan.models));
    storage.db
      .prepare(
        "INSERT OR REPLACE INTO product_state VALUES('legacy-user-settings',?)",
      )
      .run(canonical(sourceSettings(plan)));
  });
}
function sourceSettings(plan) {
  return plan.userSettings || [];
}
async function validateConnections(storage, plan, secrets) {
  for (const c of plan.connections) {
    const row = storage.db
      .prepare("SELECT * FROM provider_connections WHERE provider_id=?")
      .get(c.providerId);
    if (
      !row ||
      row.base_url !== c.baseUrl.replace(/\/+$/, "") ||
      row.api_type !== c.apiType ||
      row.deleted !== Number(c.deleted) ||
      row.enabled !== Number(c.enabled) ||
      canonical(json(row.model_ids)) !== canonical(c.modelIds)
    )
      fail();
    if (
      row.secret_ref &&
      (await secrets({
        operation: "get",
        providerId: c.providerId,
        secretRef: row.secret_ref,
      })) !== c.apiKey
    )
      fail();
    if (!row.secret_ref && c.keyAction === "set") fail();
  }
}
module.exports = { mapConnections, storeConnections, validateConnections };
