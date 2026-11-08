import { ApiError, id, read, stored, remember, json, schemas } from "../api";
import type { InputPart } from "../../../contracts/index.js";
import { legacyDraft } from "./legacyDraft";

export async function upgradeBrowserDrafts(): Promise<string> {
  const keys: string[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && /^(chat-input|chat-input-[A-Za-z0-9_-]{1,160})$/.test(key))
        keys.push(key);
    }
    if (!keys.length) return "";
    // Preserve every original before attempting network/format conversion.
    for (const key of keys) {
      const raw = sessionStorage.getItem(key);
      if (raw === null) continue;
      const chatKey = key === "chat-input" ? "new" : key.slice(11);
      const backup = "snap.legacyDraft.original.v1:" + chatKey;
      if (localStorage.getItem(backup) === null)
        localStorage.setItem(backup, raw);
      if (!localStorage.getItem(backup))
        throw new Error("DRAFT_BACKUP_UNAVAILABLE");
    }
    const browserClientId = stored("snap.browserClientId") || id();
    remember("snap.browserClientId", browserClientId);
    const models = await readModels();
    let pending = 0;
    for (const key of keys) {
      const chatKey = key === "chat-input" ? "new" : key.slice(11);
      const raw = sessionStorage.getItem(key);
      if (raw === null || stored("snap.legacyDraft.done.v1:" + chatKey) === raw)
        continue;
      try {
        const value = await legacyDraft(raw, chatKey, models);
        if (value.images.some((file) => file.unresolved)) {
          pending++;
          continue;
        }
        const parts: InputPart[] = [
          ...(value.text ? [{ type: "text" as const, text: value.text }] : []),
          ...value.images.map((file) => ({
            type: "image" as const,
            fileId: file.fileId,
          })),
        ];
        let current = null;
        try {
          current = await read(
            "draft",
            `/snap/api/drafts/${chatKey}?browserClientId=${browserClientId}`,
          );
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
        }
        if (
          current?.parts.length &&
          (JSON.stringify(current.parts) !== JSON.stringify(parts) ||
            current.modelId !== value.modelId)
        ) {
          pending++;
          continue;
        }
        const saved = current?.parts.length
          ? current
          : await read(
              "draft",
              "/snap/api/drafts/" + chatKey,
              {
                apiVersion: 1,
                browserClientId,
                expectedRevision: current?.revision || 0,
                modelId: value.modelId,
                parts,
              },
              "PUT",
            );
        if (
          JSON.stringify(saved.parts) !== JSON.stringify(parts) ||
          saved.modelId !== value.modelId
        )
          throw new Error("DRAFT_VALIDATION_FAILED");
        localStorage.setItem("snap.legacyDraft.done.v1:" + chatKey, raw);
      } catch {
        pending++;
      }
    }
    localStorage.setItem(
      "snap.browserMigration.v1",
      JSON.stringify({
        schemaVersion: 1,
        origin: location.origin,
        status: pending ? "pending" : "validated",
        drafts: keys.length,
        pending,
      }),
    );
    return pending ? "部分旧草稿还需确认，原文字和图片引用已保留" : "";
  } catch {
    return "旧草稿仍保留在此浏览器，暂未完成全部迁移";
  }
}
async function readModels(): Promise<string> {
  // Model choice metadata only; never creates a model request.
  const response = await json("/snap/api/models");
  if (!Array.isArray(response)) throw new Error("MODELS_UNAVAILABLE");
  const models = response.map((value) => schemas.publicModel.parse(value));
  const first = models.find((model) => model.configured) || models[0];
  if (!first) throw new Error("MODELS_UNAVAILABLE");
  return first.id;
}
