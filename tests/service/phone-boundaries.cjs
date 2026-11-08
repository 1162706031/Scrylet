const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Storage } = require("../../service/storage.cjs");
const { Files } = require("../../service/files.cjs");
const { Chats } = require("../../service/chats.cjs");
const { createRoutes } = require("../../service/routes.cjs");
const { createHttp } = require("../../service/http.cjs");
const { validate } = require("../../contracts/validate.cjs");
module.exports = async function phoneBoundaries(directory) {
  const storage = new Storage(directory), files = new Files(storage), chats = new Chats(storage, files);
  const credential = "synthetic-local-boundary-credential";
  const server = await createHttp({ credential, route: createRoutes({ chats, files, providers: {}, generations: {}, prompts: {} }) });
  const base = `http://127.0.0.1:${server.address().port}/snap/api`;
  const call = (route, value, method = "GET") => fetch(base + route, { method, headers: { authorization: "Bearer " + credential, "x-scrylet-device": "synthetic-device", "content-type": "application/json" }, ...(value ? { body: JSON.stringify(value) } : {}) });
  try {
    const image = Buffer.from(require("../fixtures/legacy-v1/database.json").attachments[0].base64, "base64"), file = files.put(image, { name: "旧上传.jpg", mime: "image/jpeg" });
    storage.db.prepare("INSERT INTO legacy_ids VALUES('file',?,?,?)").run("legacy-upload", file.id, crypto.createHash("sha256").update(image).digest("hex"));
    for (const route of ["/files/" + file.id + "/meta", "/legacy/files/legacy-upload"]) { const response = await call(route); assert.equal(response.status, 200); assert.deepEqual(validate("file", await response.json()), file); }
    let response = await call("/legacy/files/absent"); assert.equal(response.status, 409); assert.equal((await response.json()).code, "MIGRATION_FAILED");
    response = await call("/files/" + file.id + "/meta?path=forged"); assert.equal(response.status, 400);
    const chat = chats.create({ apiVersion: 1, modelId: "openai.fixture", title: "编辑边界" });
    const node = (id, parentMessageId, role) => ({ id, parentMessageId, role, chatId: chat.id, modelId: role === "assistant" ? chat.modelId : null, status: role === "assistant" ? "completed" : null, createdAt: Date.now(), parts: role === "user" ? [{ type: "text", text: "原问题" }, { type: "image", fileId: file.id }] : [{ type: "text", text: "旧回答" }] });
    storage.transaction(() => { chats.insertMessage(node("user", null, "user"), { legacy: { unknown: "preserved" } }); chats.insertMessage(node("assistant", "user", "assistant"), { providerOutput: { messages: ["must-be-cleared"] } }); });
    const route = "/chats/" + chat.id + "/messages/assistant", body = { apiVersion: 1, version: 0, parts: [{ type: "text", text: "保存编辑" }] };
    response = await call(route, body, "PATCH"); assert.equal(response.status, 200); const saved = validate("chat", await response.json()); assert.equal(saved.messages.length, 2); assert.equal(saved.messages[1].parentMessageId, "user");
    assert.equal(storage.db.prepare("SELECT provider_output FROM messages WHERE chat_id=? AND id='assistant'").get(chat.id).provider_output, "null");
    response = await call(route, body, "PATCH"); assert.equal(response.status, 409); assert.equal(chats.get(chat.id).messages[1].parts[0].text, "保存编辑");
    response = await call("/chats/" + chat.id + "/messages/user", { ...body, version: 1, parts: [{ type: "image", fileId: "missing" }] }, "PATCH"); assert.equal(response.status, 404); assert.equal(chats.get(chat.id).version, 1); assert.equal(chats.get(chat.id).messages[0].parts[1].fileId, file.id);
    const read = chats.patch(chat.id, { apiVersion: 1, version: 1, lastReadAt: Math.max(saved.updatedAt, Date.now()) }); assert.equal(read.updatedAt, saved.updatedAt);
    assert.equal(storage.db.prepare("PRAGMA foreign_key_check").all().length, 0);
    return ["phone-file-metadata-legacy-map-no-fallback", "phone-message-save-transaction-version-images-provider-output", "phone-read-marker-preserves-content-time"];
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); storage.close(); }
};
