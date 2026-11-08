import { ApiError, read, remember, stored } from "../api";
import type { DraftSnapshot } from "../../../contracts/index.js";
import { uploadImage } from "../attachments/images";
import type { ImageRef } from "./useComposer";
type RecordValue = Record<string, unknown>;
const importedImages = new Map<string, { raw: string; images: ImageRef[] }>();
function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}
export function legacySource(chatKey: string): string | null {
  try {
    const raw = sessionStorage.getItem(
      chatKey === "new" ? "chat-input" : "chat-input-" + chatKey,
    );
    return raw && stored("snap.legacyDraft.done.v1:" + chatKey) !== raw
      ? raw
      : null;
  } catch {
    return null;
  }
}
export async function legacyDraft(
  raw: string,
  chatKey: string,
  defaultModel: string,
): Promise<{ text: string; modelId: string; images: ImageRef[] }> {
  const value = record(JSON.parse(raw) as unknown);
  if (
    !value ||
    typeof value.prompt !== "string" ||
    value.prompt.length > 1_000_000 ||
    !Array.isArray(value.files) ||
    value.files.length > 12
  )
    throw new ApiError(
      "MIGRATION_FAILED",
      "旧草稿格式暂无法读取，原数据未改动",
    );
  // Keep the entire original payload, including currently disabled tool metadata.
  remember("snap.legacyDraft.raw.v1:" + chatKey, raw);
  let imported = importedImages.get(chatKey);
  if (!imported || imported.raw !== raw) {
    imported = { raw, images: [] };
    importedImages.set(chatKey, imported);
  }
  let modelId = defaultModel;
  try {
    const models: unknown = JSON.parse(
      sessionStorage.getItem("selectedModels") || "null",
    );
    if (Array.isArray(models) && typeof models[0] === "string")
      modelId = models[0];
  } catch {
    /* Optional legacy model selection. */
  }
  const images: ImageRef[] = [];
  for (let index = 0; index < value.files.length; index++) {
    const file = record(value.files[index]),
      nested = record(file?.file),
      metadata = record(nested?.meta);
    const name =
      typeof file?.name === "string"
        ? file.name
        : typeof metadata?.name === "string"
          ? metadata.name
          : "旧草稿图片 " + (index + 1);
    try {
      if (!file) throw new Error("INVALID_ATTACHMENT");
      let url =
        typeof file.url === "string"
          ? file.url
          : typeof nested?.url === "string"
            ? nested.url
            : "";
      if (
        /^data:image\//.test(url) ||
        url.startsWith("blob:" + location.origin + "/")
      ) {
        const cached = imported.images[index];
        if (cached) {
          const file = await read(
            "file",
            "/snap/api/files/" + cached.fileId + "/meta",
          );
          images.push({ fileId: file.id, name: file.name, mime: file.mime });
        } else {
          const source = await fetch(url);
          const blob = await source.blob();
          if (!source.ok || !/^image\/(png|jpeg|gif|webp)$/.test(blob.type))
            throw new Error("UNMAPPED_ATTACHMENT");
          const result = await uploadImage(blob, name);
          imported.images[index] = result;
          images.push(result);
        }
        continue;
      }
      if (/^https?:\/\//.test(url)) {
        const parsed = new URL(url);
        if (
          parsed.origin !== location.origin ||
          parsed.username ||
          parsed.password
        )
          throw new Error("UNMAPPED_ATTACHMENT");
        url = parsed.pathname;
      }
      const current = /^\/snap\/api\/files\/([A-Za-z0-9_-]+)$/.exec(url);
      const old = /^\/api\/v1\/files\/([A-Za-z0-9_-]+)\/content$/.exec(url);
      const oldId =
        old?.[1] ||
        (url && /^[A-Za-z0-9_-]{1,160}$/.test(url)
          ? url
          : !url && typeof file.id === "string"
            ? file.id
            : !url && typeof nested?.id === "string"
              ? nested.id
              : null);
      if (!current && !oldId) throw new Error("UNMAPPED_ATTACHMENT");
      const result = await read(
        "file",
        current
          ? "/snap/api/files/" + current[1] + "/meta"
          : "/snap/api/legacy/files/" + oldId,
      );
      images.push({ fileId: result.id, name, mime: result.mime });
    } catch {
      images.push({
        fileId: "legacy-pending-" + index,
        name,
        mime: "image/jpeg",
        unresolved: "旧图片尚未映射，原引用已保留",
      });
    }
  }
  return { text: value.prompt, modelId, images };
}

// A saved browser draft also remains readable by the pinned legacy page after
// rollback. Original keys/payloads are backed up, never cleared. Server chat DBs
// are not dual-written; file IDs are stable in the validated rollback copy.
export async function mirrorLegacyDraft(
  chatKey: string,
  draft: DraftSnapshot,
): Promise<void> {
  const key = chatKey === "new" ? "chat-input" : "chat-input-" + chatKey;
  const raw = sessionStorage.getItem(key);
  let original: RecordValue = {};
  if (raw) {
    original = record(JSON.parse(raw) as unknown) || {};
    const backup = "snap.legacyDraft.original.v1:" + chatKey;
    if (localStorage.getItem(backup) === null)
      localStorage.setItem(backup, raw);
  }
  const metadata = await Promise.all(
    draft.parts
      .filter((p) => p.type === "image")
      .map((p) => read("file", "/snap/api/files/" + p.fileId + "/meta")),
  );
  const previous = Array.isArray(original.files) ? original.files : [];
  const files = metadata.map((file) => {
    const old =
      record(previous.find((value) => record(value)?.id === file.id)) || {};
    return {
      ...old,
      type: "file",
      id: file.id,
      url: file.id,
      name: file.name,
      content_type: file.mime,
      size: file.bytes,
      status: "uploaded",
      file: {
        ...record(old.file),
        id: file.id,
        filename: file.name,
        meta: {
          ...record(record(old.file)?.meta),
          name: file.name,
          content_type: file.mime,
          size: file.bytes,
        },
      },
    };
  });
  const value = JSON.stringify({
    ...original,
    prompt: draft.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n"),
    files,
  });
  const pending = "snap.legacyDraft.rollback.pending.v1:" + chatKey;
  localStorage.setItem(pending, value);
  sessionStorage.setItem(key, value);
  const selected = sessionStorage.getItem("selectedModels");
  if (
    selected &&
    localStorage.getItem("snap.legacyModels.original.v1") === null
  )
    localStorage.setItem("snap.legacyModels.original.v1", selected);
  sessionStorage.setItem("selectedModels", JSON.stringify([draft.modelId]));
  localStorage.setItem("snap.legacyDraft.done.v1:" + chatKey, value);
  localStorage.removeItem(pending); // Only our completed version marker.
}
