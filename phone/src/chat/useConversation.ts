import { Chat, useChat } from "@ai-sdk/react";
import { useSyncExternalStore } from "react";
import type { UIMessage } from "ai";
import type {
  Chat as ChatRecord,
  PublicModel,
  SubmitMessage,
  AcceptedSubmission,
} from "../../../contracts/index.js";
import { ApiError, id, messageOf, read, json } from "../api";
import { Composer } from "./useComposer";
import { branch, ProductTransport, uiMessage } from "./transport";
import type { Lifecycle } from "./transport";
type ConversationState = {
  graph: ChatRecord | null;
  loading: boolean;
  error: string;
  activeGenerationId: string | null;
};
export class Conversation {
  private listeners = new Set<() => void>();
  private alive = true;
  private receiverPath: string;
  private pending: {
    requestId: string;
    context: { epoch: string; revision: number };
    clear: boolean;
    resolve(): void;
    reject(error: unknown): void;
  } | null = null;
  private state: ConversationState = {
    graph: null,
    loading: true,
    error: "",
    activeGenerationId: null,
  };
  readonly composer: Composer;
  readonly transport: ProductTransport;
  readonly sdk: Chat<UIMessage>;
  lifecycle: Lifecycle = {
    begin: () => {},
    finish: () => {},
    cancel: () => {},
  };
  constructor(
    readonly routeId: string | null,
    public models: PublicModel[],
    readonly changed: () => void,
  ) {
    this.receiverPath = routeId ? "/c/" + routeId : "/";
    this.composer = new Composer(
      routeId || "new",
      models.find((m) => m.configured)?.id ||
        models[0]?.id ||
        "openai.gpt-6.1-sol",
      (options) => this.submit(options),
    );
    this.transport = new ProductTransport({
      accepted: (value) => this.accept(value),
      settled: () => {
        setTimeout(() => void this.load(false), 0);
      },
      lifecycle: () => this.lifecycle,
    });
    this.sdk = new Chat({
      id: routeId || id(),
      transport: this.transport,
      onFinish: () => {
        setTimeout(() => void this.load(false), 0);
      },
      onError: (error) => {
        this.lifecycle.cancel();
        this.composer.set({ submitting: false });
        this.set({ error: messageOf(error) });
        void this.load(false);
        this.pending?.reject(error);
        if (
          error instanceof ApiError &&
          error.status > 0 &&
          error.status < 500
        ) {
          this.composer.set({ uncertain: null });
          this.pending = null;
        }
      },
    });
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = (): ConversationState => this.state;
  set(change: Partial<ConversationState>): void {
    if (!this.alive) return;
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  get graph(): ChatRecord | null {
    return this.state.graph;
  }
  selectBranch(messageId: string): void {
    const graph = this.graph;
    if (!graph || this.generating) return;
    let selected = messageId;
    for (;;) {
      const child = graph.messages
        .filter((m) => m.parentMessageId === selected)
        .at(-1);
      if (!child) break;
      selected = child.id;
    }
    this.sdk.messages = branch(graph.messages, selected).map(uiMessage);
    this.set({ graph: { ...graph, currentMessageId: selected } });
  }
  get generating(): boolean {
    return (
      this.sdk.status === "submitted" ||
      this.sdk.status === "streaming" ||
      Boolean(this.state.activeGenerationId)
    );
  }
  context(): string {
    return this.receiverPath + ":" + this.composer.state.epoch;
  }
  async load(initial = true): Promise<void> {
    const chatId = this.state.graph?.id || this.routeId;
    try {
      if (chatId) {
        const graph = await read("chat", `/snap/api/chats/${chatId}`);
        if (!this.alive) return;
        this.set({
          graph,
          activeGenerationId: graph.activeGeneration?.id || null,
        });
        if (this.sdk.status !== "submitted" && this.sdk.status !== "streaming")
          this.sdk.messages = branch(
            graph.messages,
            graph.currentMessageId,
          ).map(uiMessage);
        this.transport.chatId = graph.id;
        if (initial && graph.activeGeneration) {
          this.transport.active = graph.activeGeneration.id;
          void this.sdk.resumeStream();
        }
      }
      if (initial) await this.composer.load();
      this.set({ loading: false });
      this.changed();
    } catch (error) {
      this.set({ loading: false, error: messageOf(error) });
    }
  }
  async submit(
    options: {
      command?: { id: string; clientId: string; context: string };
      action?: "edit" | "regenerate";
      targetMessageId?: string;
      text?: string;
      style?: "retry" | "detail" | "concise";
    } = {},
  ): Promise<void> {
    const composer = this.composer,
      state = composer.state,
      context = composer.context();
    if (
      this.generating ||
      state.submitting ||
      state.uncertain ||
      state.processing
    )
      throw new ApiError("VERSION_CONFLICT", "正在处理内容，请稍后再发送");
    if (this.state.loading || (this.routeId && !this.graph))
      throw new ApiError("NOT_READY", "对话尚未读取，草稿已保留");
    if (!this.models.some((m) => m.id === state.modelId && m.configured))
      throw new ApiError("NOT_READY", "请先连接模型服务");
    const normal = !options.action,
      original = this.graph?.messages.find(
        (m) => m.id === options.targetMessageId,
      );
    const parts =
      options.action === "regenerate"
        ? []
        : normal
          ? composer.parts()
          : [
              { type: "text" as const, text: options.text || "" },
              ...(original?.parts.filter((p) => p.type === "image") || []),
            ];
    if (
      options.action !== "regenerate" &&
      !parts.some((p) => p.type === "image" || p.text.trim())
    )
      return;
    composer.set({ submitting: true, error: "" });
    this.set({ error: "" });
    this.sdk.clearError();
    try {
      let graph = this.graph;
      if (!graph) {
        graph = await read("chat", "/snap/api/chats", {
          apiVersion: 1,
          modelId: state.modelId,
          title: state.text.trim().slice(0, 80) || "图片对话",
        });
        this.set({ graph });
      }
      let parentMessageId = graph.currentMessageId;
      if (options.action) {
        const target = graph.messages.find(
          (m) => m.id === options.targetMessageId,
        );
        if (!target) throw new ApiError("NOT_FOUND", "消息不存在");
        parentMessageId = target.parentMessageId;
      }
      const base = {
        apiVersion: 1 as const,
        requestId: id(),
        chatVersion: graph.version,
        parentMessageId,
        modelId: state.modelId,
        parts,
      };
      const submission: SubmitMessage = options.command
        ? { ...base, origin: "desktop", command: options.command }
        : options.action
          ? {
              ...base,
              origin: "manual",
              action: options.action,
              targetMessageId: options.targetMessageId || "",
              ...(options.action === "regenerate" && options.style
                ? { regenerationStyle: options.style }
                : {}),
            }
          : { ...base, origin: "manual" };
      if (options.command) {
        composer.assert(context);
        await readCommand(options.command);
        composer.assert(context);
      }
      composer.set({
        uncertain: { requestId: submission.requestId, chatId: graph.id },
      });
      const accepted = new Promise<void>((resolve, reject) => {
        this.pending = {
          requestId: submission.requestId,
          context,
          clear: normal,
          resolve,
          reject,
        };
      });
      const body = { submission, productChatId: graph.id };
      if (options.action === "regenerate")
        void this.sdk
          .regenerate({ messageId: options.targetMessageId, body })
          .catch((error) => this.pending?.reject(error));
      else
        void this.sdk
          .sendMessage(
            {
              id: submission.requestId,
              role: "user",
              parts: parts.map((p) =>
                p.type === "image"
                  ? {
                      type: "file",
                      mediaType: "image/jpeg",
                      url: "/snap/api/files/" + p.fileId,
                    }
                  : { type: "text", text: p.text },
              ),
            },
            { body },
          )
          .catch((error) => this.pending?.reject(error));
      await accepted;
    } catch (error) {
      composer.set({ submitting: false });
      throw error;
    }
  }
  private accept(value: AcceptedSubmission): void {
    if (!this.alive) return;
    const pending = this.pending;
    if (pending) {
      this.composer.accepted(pending.context, pending.clear);
      pending.resolve();
      this.pending = null;
    }
    if (this.graph)
      this.set({
        graph: {
          ...this.graph,
          version: value.chatVersion,
          currentMessageId: value.assistantMessageId,
        },
        activeGenerationId: ["accepted", "requesting", "streaming"].includes(
          value.status,
        )
          ? value.generationId
          : null,
      });
    history.replaceState(null, "", "/c/" + value.chatId);
    this.receiverPath = "/c/" + value.chatId;
    if (this.composer.chatKey !== value.chatId)
      void this.composer.rekey(value.chatId);
    this.changed();
  }
  async confirm(): Promise<void> {
    const uncertain = this.composer.state.uncertain;
    if (!uncertain) return;
    const result = await read(
      "acceptedSubmission",
      "/snap/api/requests/" + uncertain.requestId,
    );
    if (!this.pending)
      this.composer.accepted(
        this.composer.context(),
        this.composer.state.revision === 0,
      );
    if (!this.graph)
      this.set({
        graph: await read("chat", "/snap/api/chats/" + result.chatId),
      });
    this.accept(result);
    await this.load(false);
    this.transport.active = result.generationId;
    void this.sdk.resumeStream();
  }
  async stop(): Promise<void> {
    this.lifecycle.cancel();
    await this.transport.stop();
    await this.sdk.stop();
    await this.load(false);
  }
  async resume(): Promise<void> {
    this.lifecycle.cancel();
    if (!this.transport.active)
      this.transport.active = this.state.activeGenerationId;
    await this.sdk.resumeStream();
  }
  dispose(): void {
    this.alive = false;
    this.lifecycle.cancel();
    this.transport.close();
    void this.sdk.stop();
    this.composer.dispose();
    this.listeners.clear();
  }
}
async function readCommand(command: {
  id: string;
  clientId: string;
  context: string;
}): Promise<void> {
  await json("/snap/api/desktop/validate", command);
}
export function useConversation(
  controller: Conversation,
): ConversationState & Omit<ReturnType<typeof useChat<UIMessage>>, "error"> {
  const snapshot = useSyncExternalStore(
      controller.subscribe,
      controller.snapshot,
    ),
    sdk = useChat({ chat: controller.sdk });
  return { ...sdk, ...snapshot };
}
