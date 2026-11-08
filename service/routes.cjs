const { validate, ContractError } = require("../contracts/validate.cjs");
const { json, body, readBytes } = require("./http.cjs");
const { MAX_BYTES } = require("./files.cjs");
function query(url, keys) { for (const key of url.searchParams.keys()) if (!keys.includes(key) || url.searchParams.getAll(key).length > 1) throw new ContractError(); }
function integer(value, fallback) { if (value === null) return fallback; if (!/^\d{1,16}$/.test(value)) throw new ContractError(); const n = Number(value); if (!Number.isSafeInteger(n)) throw new ContractError(); return n; }
function boolean(value, fallback) { if (value === null) return fallback; if (value !== "true" && value !== "false") throw new ContractError(); return value === "true"; }
function createRoutes({ chats, files, prompts, providers, generations }) {
  return async (req, res, url) => {
    const route = url.pathname.slice("/snap/api".length), method = req.method;
    if (method === "GET" && route === "/health") { query(url, []); return json(res, 200, { apiVersion: 1, ready: true }); }
    if (method === "GET" && route === "/providers") { query(url, []); return json(res, 200, validate("providerCatalog", providers.directory())); }
    if (method === "GET" && route === "/models") { query(url, []); return json(res, 200, providers.models()); }
    const provider = /^\/providers\/([A-Za-z0-9_-]+)$/.exec(route);
    if (method === "POST" && provider) { query(url, []); return json(res, 200, await providers.save(provider[1], await body(req, 8192))); }
    const deviceId = req.headers["x-scrylet-device"];
    if (typeof deviceId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(deviceId)) throw new ContractError("UNAUTHORIZED", 401);
    if (route === "/chats" && method === "POST") {
      query(url, []); const value = validate("createChat", await body(req));
      if (!providers.models().some(m => m.id === value.modelId)) throw new ContractError("NOT_FOUND", 404);
      return json(res, 201, chats.create(value));
    }
    if (route === "/chats" && method === "GET") {
      query(url, ["limit", "cursor", "search", "archived", "pinned", "unread"]);
      return json(res, 200, validate("chatPage", chats.list({ limit: integer(url.searchParams.get("limit"), 30), cursor: url.searchParams.get("cursor"), search: url.searchParams.get("search") || "",
        archived: boolean(url.searchParams.get("archived"), false), pinned: boolean(url.searchParams.get("pinned"), null), unread: boolean(url.searchParams.get("unread"), false) })));
    }
    if (route === "/chats/read" && method === "POST") { query(url, []); validate("emptyOperation", await body(req, 1024)); return json(res, 200, chats.markAllRead()); }
    const chat = /^\/chats\/([A-Za-z0-9_-]+)$/.exec(route);
    if (chat) {
      query(url, []);
      if (method === "GET") { const active = chats.db.prepare("SELECT id FROM generations WHERE chat_id=? AND status IN ('accepted','requesting','streaming')").get(chat[1]);
        return json(res, 200, validate("chat", { ...chats.get(chat[1]), activeGeneration: active ? generations.get(active.id) : null })); }
      if (method === "PATCH") return json(res, 200, chats.patch(chat[1], await body(req)));
      if (method === "DELETE") return json(res, 200, chats.delete(chat[1], validate("versionedOperation", await body(req, 1024)).version));
    }
    const clone = /^\/chats\/([A-Za-z0-9_-]+)\/clone$/.exec(route);
    if (clone && method === "POST") { query(url, []); validate("emptyOperation", await body(req, 1024)); return json(res, 201, chats.clone(clone[1])); }
    const message = /^\/chats\/([A-Za-z0-9_-]+)\/messages\/([A-Za-z0-9_-]+)$/.exec(route);
    if (message && method === "PATCH") { query(url, []); return json(res, 200, chats.editMessage(message[1], message[2], await body(req))); }
    if (message && method === "DELETE") { query(url, []); return json(res, 200, chats.deleteMessage(message[1], message[2], validate("versionedOperation", await body(req, 1024)).version)); }
    const submit = /^\/chats\/([A-Za-z0-9_-]+)\/messages$/.exec(route);
    if (submit && method === "POST") { query(url, []); return json(res, 202, generations.submit(submit[1], deviceId, await body(req))); }
    const request = /^\/requests\/([A-Za-z0-9_-]+)$/.exec(route);
    if (request && method === "GET") { query(url, []); return json(res, 200, generations.lookup(deviceId, request[1])); }
    const gen = /^\/generations\/([A-Za-z0-9_-]+)(?:\/(events|stop))?$/.exec(route);
    if (gen) {
      if (!gen[2] && method === "GET") { query(url, []); return json(res, 200, generations.get(gen[1])); }
      if (gen[2] === "events" && method === "GET") { query(url, ["after"]); return generations.subscribe(gen[1], integer(url.searchParams.get("after"), 0), res); }
      if (gen[2] === "stop" && method === "POST") { query(url, []); validate("emptyOperation", await body(req, 1024)); return json(res, 200, await generations.stop(gen[1])); }
    }
    if (route === "/files" && method === "POST") {
      query(url, ["name"]); const bytes = await readBytes(req, MAX_BYTES);
      return json(res, 201, files.put(bytes, { name: url.searchParams.get("name"), mime: req.headers["content-type"] }));
    }
    const file = /^\/files\/([A-Za-z0-9_-]+)$/.exec(route);
    const metadata = /^\/files\/([A-Za-z0-9_-]+)\/meta$/.exec(route);
    if (metadata && method === "GET") { query(url, []); return json(res, 200, files.read(metadata[1]).value); }
    const oldFile = /^\/legacy\/files\/([A-Za-z0-9_-]+)$/.exec(route);
    const oldContent = /^\/legacy\/files\/([A-Za-z0-9_-]+)\/content$/.exec(route);
    if (oldContent && method === "GET") {
      query(url, []);
      const mapped = chats.db.prepare("SELECT target_id FROM legacy_ids WHERE kind='file' AND source_id=?").get(oldContent[1]);
      if (!mapped) throw new ContractError("MIGRATION_FAILED", 409);
      const { value, bytes } = files.read(mapped.target_id);
      res.writeHead(200, { "Content-Type": value.mime, "Content-Length": bytes.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" });
      res.end(bytes); return;
    }
    if (oldFile && method === "GET") {
      query(url, []);
      const mapped = chats.db.prepare("SELECT target_id FROM legacy_ids WHERE kind='file' AND source_id=?").get(oldFile[1]);
      if (!mapped) throw new ContractError("MIGRATION_FAILED", 409);
      return json(res, 200, files.read(mapped.target_id).value);
    }
    if (file && method === "GET") {
      query(url, []); const { value, bytes } = files.read(file[1]);
      res.writeHead(200, { "Content-Type": value.mime, "Content-Length": bytes.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" });
      res.end(bytes); return;
    }
    const draft = /^\/drafts\/([A-Za-z0-9_-]+)$/.exec(route);
    if (draft) {
      if (method === "GET") { query(url, ["browserClientId"]); return json(res, 200, chats.readDraft(deviceId, url.searchParams.get("browserClientId"), draft[1])); }
      if (method === "PUT") { query(url, []); return json(res, 200, chats.writeDraft(deviceId, draft[1], await body(req))); }
    }
    if (route === "/prompts" && method === "GET") { query(url, []); return json(res, 200, prompts.list()); }
    const prompt = /^\/prompts\/([A-Za-z0-9_-]+)$/.exec(route);
    if (prompt && method === "PATCH") {
      query(url, []); const value = validate("promptChange", await body(req)); if (value.id !== prompt[1]) throw new ContractError(); return json(res, 200, prompts.save(value));
    }
    throw new ContractError("NOT_FOUND", 404);
  };
}
module.exports = { createRoutes };
