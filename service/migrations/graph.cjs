const { validateGraph } = require("../../contracts/validate.cjs");
const {
  fail,
  digest,
  canonical,
  json,
  safeId,
  milliseconds,
  object,
} = require("./common.cjs");
const { reference } = require("./files.cjs");
function contentParts(content, attachments, files) {
  let parts = [];
  if (typeof content === "string") parts.push({ type: "text", text: content });
  else if (Array.isArray(content))
    for (const p of content) {
      if (p?.type === "text" && typeof p.text === "string")
        parts.push({ type: "text", text: p.text });
      else if (p?.type === "image_url")
        parts.push({
          type: "image",
          fileId: reference(
            {
              url:
                typeof p.image_url === "string"
                  ? p.image_url
                  : p.image_url?.url,
            },
            files,
          ),
        });
      else fail();
    }
  else if (content !== null && content !== undefined) fail();
  for (const attachment of attachments || [])
    parts.push({ type: "image", fileId: reference(attachment, files) });
  return parts;
}
function preservedTime(value, explicit) {
  return Number.isSafeInteger(explicit) &&
    explicit >= 0 &&
    Math.floor(explicit / 1000) === value
    ? explicit
    : milliseconds(value);
}
function messageParts(node, files) {
  const output = Array.isArray(node.output) ? node.output : [];
  const fallback = output
    .flatMap((p) =>
      p.type === "message" && Array.isArray(p.content)
        ? p.content
            .filter(
              (c) =>
                ["output_text", "text"].includes(c.type) &&
                typeof c.text === "string",
            )
            .map((c) => c.text)
        : [],
    )
    .join("\n");
  const value =
    node.content === null || node.content === undefined || node.content === ""
      ? fallback
      : node.content;
  const parts = contentParts(value, node.files, files),
    reasoning = output
      .flatMap((p) =>
        p.type === "reasoning" && Array.isArray(p.summary)
          ? p.summary
              .filter((c) => typeof c.text === "string")
              .map((c) => c.text)
          : [],
      )
      .join("\n");
  return reasoning ? [{ type: "reasoning", text: reasoning }, ...parts] : parts;
}
function state(node) {
  if (node.role !== "assistant") return null;
  if (node.error) return "failed";
  const explicit = node.meta?.scryletNodeStatus;
  if (["completed", "stopped", "failed", "interrupted"].includes(explicit))
    return explicit;
  if (
    Array.isArray(node.output) &&
    node.output.some((p) => p.status === "incomplete")
  )
    return "stopped";
  return node.done === false || node.done === 0 ? "interrupted" : "completed";
}
function normalized(row, chatId) {
  const node = {
    id: row.id.startsWith(chatId + "-")
      ? row.id.slice(chatId.length + 1)
      : row.id,
    parentId: row.parent_id,
    role: row.role,
    content: row.content,
    done: row.done,
    output: row.output,
    timestamp: row.created_at,
    model: row.model_id,
    meta: row.meta,
    error: row.error,
  };
  if (row.files !== null) node.files = row.files;
  return node;
}
function mapChatsAndBranches(source, files) {
  const plans = [];
  let conflicts = 0;
  for (const row of source.tables.chat) {
    const raw = json(row.chat, {}),
      embedded = raw.history?.messages || {},
      nodes = new Map(Object.entries(embedded)),
      normal = source.tables.chat_message.filter((m) => m.chat_id === row.id),
      primary = new Map(nodes);
    for (const n of normal) {
      const node = normalized(n, row.id),
        old = nodes.get(node.id) || {};
      primary.set(node.id, {
        ...old,
        ...Object.fromEntries(
          Object.entries(node).filter(
            ([key, value]) => value !== null || key === "parentId",
          ),
        ),
        content: node.content ?? "",
      });
    }
    const modelId =
      raw.models?.[0] || [...primary.values()].find((m) => m.model)?.model;
    if (typeof modelId !== "string" || !modelId) fail();
    const convert = (node, id, rename = new Map()) => {
      if (
        !object(node) ||
        !["system", "user", "assistant"].includes(node.role) ||
        (node.id && typeof node.id !== "string")
      )
        fail();
      return {
        id: safeId(id),
        chatId: safeId(row.id),
        parentMessageId: node.parentId
          ? safeId(rename.get(node.parentId) || node.parentId)
          : null,
        role: node.role,
        modelId:
          node.model ||
          node.models?.[0] ||
          (node.role === "assistant" ? modelId : null),
        parts: messageParts(node, files),
        createdAt: preservedTime(
          node.timestamp ?? row.created_at,
          node.meta?.scryletNodeCreatedAt,
        ),
        status: state(node),
      };
    };
    const primaryMessages = [...primary].map(([id, node]) => convert(node, id));
    const compare = (m) => ({
      parentMessageId: m.parentMessageId,
      role: m.role,
      modelId: m.modelId,
      parts: m.parts,
      status: m.status,
    });
    const conflict = normal.some((n) => {
      const id = normalized(n, row.id).id;
      return (
        nodes.has(id) &&
        (canonical(compare(convert(nodes.get(id), id))) !==
          canonical(compare(convert(primary.get(id), id))) ||
          canonical(nodes.get(id).output ?? null) !==
            canonical(primary.get(id).output ?? null))
      );
    });
    let messages = primaryMessages,
      extra = [];
    if (conflict) {
      conflicts++;
      const rename = new Map(
        [...nodes.keys()].map((id) => [
          id,
          "conflict_" + digest(row.id + ":" + id).slice(0, 40),
        ]),
      );
      extra = [...nodes].map(([id, node]) => ({
        message: convert(node, rename.get(id), rename),
        node,
      }));
      messages = [...messages, ...extra.map((e) => e.message)];
    }
    const chosen = primary.has(row.current_message_id)
      ? row.current_message_id
      : primary.has(raw.history?.currentId)
        ? raw.history.currentId
        : null;
    const times = json(row.meta, {})?.scryletNodeTimes;
    const chat = validateGraph({
      apiVersion: 1,
      id: safeId(row.id),
      title: row.title || raw.title || "旧对话",
      version: 0,
      currentMessageId: chosen ? safeId(chosen) : null,
      modelId,
      pinned: Boolean(row.pinned),
      archived: Boolean(row.archived),
      lastReadAt:
        row.last_read_at === null
          ? null
          : preservedTime(row.last_read_at, times?.lastReadAt),
      createdAt: preservedTime(row.created_at, times?.createdAt),
      updatedAt: preservedTime(row.updated_at, times?.updatedAt),
      messages,
    });
    const payloads = new Map(
      [...primary].map(([id, node]) => [
        safeId(id),
        {
          node,
          normalized:
            normal.find((n) => normalized(n, row.id).id === id) || null,
          embedded: embedded[id] || null,
        },
      ]),
    );
    for (const e of extra)
      payloads.set(e.message.id, {
        node: e.node,
        embedded: e.node,
        conflict: true,
      });
    plans.push({
      chat,
      raw: row,
      sourceHash: digest(canonical(row)),
      payloads,
    });
  }
  // Orphan normalized rows / relationships are not silently discarded.
  if (
    source.tables.chat_message.some(
      (m) => !source.tables.chat.some((c) => c.id === m.chat_id),
    )
  )
    fail();
  for (const link of source.tables.chat_file) {
    if (!files.some((f) => f.sourceId === link.file_id)) fail();
    if (
      !source.tables.chat.some(
        (c) => c.id === link.chat_id || json(c.chat, {}).id === link.chat_id,
      )
    )
      fail();
  }
  return { plans, conflicts };
}
module.exports = { mapChatsAndBranches, contentParts, preservedTime };
