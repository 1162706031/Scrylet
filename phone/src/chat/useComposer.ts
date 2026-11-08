import { useSyncExternalStore } from "react";
import type {
  Attachment,
  DraftSnapshot,
  InputPart,
} from "../../../contracts/index.js";
import { ApiError, id, messageOf, read, remember, stored } from "../api";
import { legacyDraft, legacySource, mirrorLegacyDraft } from "./legacyDraft";
export type ImageRef = {
  fileId: string;
  name: string;
  mime: string;
  unresolved?: string;
};
export type ComposerSnapshot = {
  text: string;
  images: ImageRef[];
  modelId: string;
  revision: number;
  epoch: string;
  processing: number;
  submitting: boolean;
  busyCommand: string | null;
  saveState: string;
  error: string;
  legacyAvailable: boolean;
  uncertain: { requestId: string; chatId: string } | null;
};
export class Composer {
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  private revisions = new Map<string, number>();
  private alive = true;
  private undoValue: {
    images: ImageRef[];
    epoch: string;
    expires: number;
  } | null = null;
  readonly browserId: string;
  state: ComposerSnapshot;
  constructor(
    public chatKey: string,
    modelId: string,
    private readonly sendAction: (options?: {
      command?: { id: string; clientId: string; context: string };
    }) => Promise<void>,
  ) {
    this.browserId = stored("snap.browserClientId") || id();
    remember("snap.browserClientId", this.browserId);
    this.state = {
      text: "",
      images: [],
      modelId,
      revision: 0,
      epoch: id(),
      processing: 0,
      submitting: false,
      busyCommand: null,
      saveState: "正在读取草稿",
      error: "",
      legacyAvailable: false,
      uncertain: null,
    };
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = (): ComposerSnapshot => this.state;
  set(change: Partial<ComposerSnapshot>, edit = false): void {
    this.state = {
      ...this.state,
      ...change,
      ...(edit
        ? { revision: this.state.revision + 1, saveState: "正在保存" }
        : {}),
    };
    for (const listener of this.listeners) listener();
    if (Object.hasOwn(change, "uncertain")) this.cache(false);
    if (edit) {
      this.cache(false);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.save(), 350);
    }
  }
  text(value: string): void {
    this.set({ text: value }, true);
  }
  model(value: string): void {
    this.set({ modelId: value }, true);
  }
  parts(): InputPart[] {
    if (this.state.images.some((file) => file.unresolved))
      throw new ApiError(
        "MIGRATION_FAILED",
        "旧草稿图片尚未迁移，原内容已保留",
      );
    return [
      ...(this.state.text.trim()
        ? [{ type: "text" as const, text: this.state.text }]
        : []),
      ...this.state.images.map((file) => ({
        type: "image" as const,
        fileId: file.fileId,
      })),
    ];
  }
  context(): { epoch: string; revision: number } {
    return { epoch: this.state.epoch, revision: this.state.revision };
  }
  assert(context: { epoch: string; revision?: number }): void {
    if (
      !this.alive ||
      context.epoch !== this.state.epoch ||
      (context.revision !== undefined &&
        context.revision !== this.state.revision)
    )
      throw new ApiError("VERSION_CONFLICT", "对话或草稿已变化，原输入已保留");
  }
  async load(): Promise<void> {
    let local: unknown;
    try {
      local = JSON.parse(
        sessionStorage.getItem("snap.draft.pending.v1:" + this.chatKey) ||
          stored("snap.draft.v1:" + this.chatKey) ||
          "null",
      );
    } catch {
      local = null;
    }
    const cached = parseCache(local);
    let draft: DraftSnapshot | null = null;
    try {
      draft = await read(
        "draft",
        `/snap/api/drafts/${this.chatKey}?browserClientId=${this.browserId}`,
      );
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        this.set({ saveState: "草稿暂未同步", error: messageOf(error) });
      }
    }
    if (!this.alive) return;
    this.revisions.set(this.chatKey, draft?.revision || 0);
    const selected =
      cached && !cached.confirmed
        ? cached
        : draft
          ? {
              text: draft.parts
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("\n"),
              images: draft.parts
                .filter((p) => p.type === "image")
                .map((p) => ({
                  fileId: p.fileId,
                  name: "已保存图片",
                  mime: "image/jpeg",
                })),
              modelId: draft.modelId,
              baseRevision: draft.revision,
              confirmed: true,
            }
          : cached;
    if (selected) {
      if (!selected.confirmed)
        this.revisions.set(this.chatKey, selected.baseRevision);
      this.set({
        text: selected.text,
        images: selected.images,
        modelId: selected.modelId,
        uncertain: "uncertain" in selected ? selected.uncertain : null,
        saveState: selected.confirmed ? "已保存" : "此页输入已保留",
      });
    } else this.set({ saveState: "已保存" });
    const old = legacySource(this.chatKey);
    if (old) {
      this.set({ legacyAvailable: true });
      if (
        (!this.state.text && !this.state.images.length) ||
        this.state.images.some((file) => file.unresolved)
      )
        await this.importLegacy();
    }
  }
  async importLegacy(): Promise<void> {
    const raw = legacySource(this.chatKey);
    if (!raw) return;
    const key = this.chatKey,
      context = this.context();
    this.set({ processing: this.state.processing + 1 });
    try {
      const result = await legacyDraft(raw, key, this.state.modelId);
      this.assert(context);
      remember("snap.draft.beforeLegacy.v1:" + key, JSON.stringify(this.state));
      this.set(
        {
          ...result,
          error: result.images.some((f) => f.unresolved)
            ? "旧草稿图片尚未迁移；未发送，原数据已保留"
            : "",
        },
        true,
      );
      if (!result.images.some((f) => f.unresolved)) {
        await this.save();
        if (this.state.saveState === "已保存") {
          remember(
            "snap.legacyDraft.done.v1:" + key,
            sessionStorage.getItem(
              key === "new" ? "chat-input" : "chat-input-" + key,
            ) || raw,
          );
          this.set({ legacyAvailable: false });
        }
      }
    } finally {
      if (this.alive)
        this.set({ processing: Math.max(0, this.state.processing - 1) });
    }
  }
  private cache(
    confirmed: boolean,
    key = this.chatKey,
    state = this.state,
  ): void {
    if (!this.alive) return;
    const uncertain =
      key === this.chatKey && state.epoch === this.state.epoch
        ? this.state.uncertain
        : state.uncertain;
    const value = JSON.stringify({
      version: 1,
      text: state.text,
      images: state.images,
      modelId: state.modelId,
      uncertain,
      baseRevision: this.revisions.get(key) || 0,
      confirmed: confirmed && !uncertain,
    });
    if (
      key !== this.chatKey ||
      (state.epoch === this.state.epoch &&
        state.revision === this.state.revision)
    ) {
      try {
        sessionStorage.setItem("snap.draft.pending.v1:" + key, value);
      } catch {
        /* Server save remains available. */
      }
    }
    if (confirmed) remember("snap.draft.v1:" + key, value);
  }
  save(): Promise<void> {
    clearTimeout(this.timer);
    const key = this.chatKey,
      state = this.state;
    if (state.images.some((f) => f.unresolved)) return Promise.resolve();
    this.queue = this.queue.then(async () => {
      try {
        const parts: InputPart[] = [
          ...(state.text ? [{ type: "text" as const, text: state.text }] : []),
          ...state.images.map((f) => ({
            type: "image" as const,
            fileId: f.fileId,
          })),
        ];
        const result = await read(
          "draft",
          `/snap/api/drafts/${key}`,
          {
            apiVersion: 1,
            browserClientId: this.browserId,
            expectedRevision: this.revisions.get(key) || 0,
            modelId: state.modelId,
            parts,
          },
          "PUT",
        );
        this.revisions.set(key, result.revision);
        this.cache(true, key, state);
        if (!state.uncertain) {
          try {
            await mirrorLegacyDraft(key, result);
          } catch {
            if (this.alive && key === this.chatKey)
              this.set({
                error: "草稿已保存；浏览器回退副本暂未写入，原内容仍保留",
              });
          }
        }
        if (
          this.alive &&
          key === this.chatKey &&
          state.revision === this.state.revision
        )
          this.set({ saveState: "已保存" });
      } catch (error) {
        this.cache(false, key, state);
        if (this.alive && key === this.chatKey)
          this.set({ saveState: "保存未确认", error: messageOf(error) });
      }
    });
    return this.queue;
  }
  cacheLocal(): void {
    this.cache(false);
  }
  async rekey(chatKey: string): Promise<void> {
    await this.save();
    this.chatKey = chatKey;
    if (!this.revisions.has(chatKey)) this.revisions.set(chatKey, 0);
    this.cache(false);
    void this.save();
  }
  send = async (options?: {
    command?: { id: string; clientId: string; context: string };
  }): Promise<void> => {
    await this.sendAction(options);
  };
  async process(
    action: () => Promise<ImageRef[]>,
    context = this.context(),
  ): Promise<void> {
    if (this.state.images.length >= 12)
      throw new ApiError("TOO_LARGE", "每次最多添加 12 张图片");
    this.set({ processing: this.state.processing + 1 });
    try {
      const images = await action();
      this.assert({ epoch: context.epoch });
      this.append(images);
    } finally {
      if (this.alive)
        this.set({ processing: Math.max(0, this.state.processing - 1) });
    }
  }
  append(images: ImageRef[]): void {
    if (this.state.images.length + images.length > 12)
      throw new ApiError("TOO_LARGE", "每次最多添加 12 张图片，已保留原附件");
    this.set({ images: [...this.state.images, ...images] }, true);
  }
  remove(ids: string[]): void {
    const removed = this.state.images.filter((file) =>
      ids.includes(file.fileId),
    );
    this.undoValue = {
      images: removed,
      epoch: this.state.epoch,
      expires: Date.now() + 10000,
    };
    this.set(
      {
        images: this.state.images.filter((file) => !ids.includes(file.fileId)),
      },
      true,
    );
  }
  undo(): void {
    const value = this.undoValue;
    if (
      !value ||
      value.epoch !== this.state.epoch ||
      value.expires < Date.now()
    ) {
      this.undoValue = null;
      return;
    }
    this.append(
      value.images.filter(
        (f) =>
          !this.state.images.some((current) => current.fileId === f.fileId),
      ),
    );
    this.undoValue = null;
  }
  canUndo(): boolean {
    return Boolean(
      this.undoValue &&
        this.undoValue.epoch === this.state.epoch &&
        this.undoValue.expires >= Date.now(),
    );
  }
  accepted(context: { epoch: string; revision: number }, clear: boolean): void {
    if (
      clear &&
      this.alive &&
      context.epoch === this.state.epoch &&
      context.revision === this.state.revision
    )
      this.set({ text: "", images: [] }, true);
    this.set({ uncertain: null, submitting: false });
  }
  dispose(): void {
    this.cache(false);
    void this.save();
    this.alive = false;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
function parseCache(value: unknown): {
  text: string;
  images: ImageRef[];
  modelId: string;
  confirmed: boolean;
  baseRevision: number;
  uncertain: ComposerSnapshot["uncertain"];
} | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("text" in value) ||
    typeof value.text !== "string" ||
    !("modelId" in value) ||
    typeof value.modelId !== "string" ||
    !("images" in value) ||
    !Array.isArray(value.images)
  )
    return null;
  const images: ImageRef[] = [];
  for (const file of value.images) {
    if (
      !file ||
      typeof file !== "object" ||
      typeof file.fileId !== "string" ||
      typeof file.name !== "string" ||
      typeof file.mime !== "string"
    )
      return null;
    images.push({
      fileId: file.fileId,
      name: file.name,
      mime: file.mime,
      ...(typeof file.unresolved === "string"
        ? { unresolved: file.unresolved }
        : {}),
    });
  }
  let uncertain: ComposerSnapshot["uncertain"] = null;
  if (
    "uncertain" in value &&
    value.uncertain &&
    typeof value.uncertain === "object" &&
    "requestId" in value.uncertain &&
    typeof value.uncertain.requestId === "string" &&
    "chatId" in value.uncertain &&
    typeof value.uncertain.chatId === "string"
  )
    uncertain = {
      requestId: value.uncertain.requestId,
      chatId: value.uncertain.chatId,
    };
  return {
    text: value.text,
    modelId: value.modelId,
    images,
    uncertain,
    confirmed: "confirmed" in value && value.confirmed === true && !uncertain,
    baseRevision:
      "baseRevision" in value && typeof value.baseRevision === "number"
        ? value.baseRevision
        : 0,
  };
}
export function useComposer(composer: Composer): ComposerSnapshot {
  return useSyncExternalStore(composer.subscribe, composer.snapshot);
}
export const imageRef = (file: Attachment): ImageRef => ({
  fileId: file.id,
  name: file.name,
  mime: file.mime,
});
