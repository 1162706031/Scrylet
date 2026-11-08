import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type {
  AcceptedSubmission,
  Generation,
  GenerationEvent,
  Message,
  SubmitMessage,
} from "../../../contracts/index.js";
import { ApiError, json, read, response, schemas } from "../api";
export type Lifecycle = {
  begin(id: string): void;
  finish(id: string, content: string): void;
  cancel(): void;
};
export function uiMessage(message: Message): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: message.parts.map((p) =>
      p.type === "image"
        ? {
            type: "file",
            mediaType: "image/jpeg",
            url: "/snap/api/files/" + p.fileId,
          }
        : { type: p.type, text: p.text },
    ),
  };
}
export function branch(messages: Message[], current: string | null): Message[] {
  const nodes = new Map(messages.map((m) => [m.id, m])),
    result: Message[] = [],
    seen = new Set<string>();
  for (
    let node = current ? nodes.get(current) : undefined;
    node;
    node = node.parentMessageId ? nodes.get(node.parentMessageId) : undefined
  ) {
    if (seen.has(node.id))
      throw new ApiError("PROTOCOL_MISMATCH", "会话分支存在错误");
    seen.add(node.id);
    result.push(node);
  }
  return result.reverse();
}
export class ProductTransport implements ChatTransport<UIMessage> {
  readonly resumeStreamIsReplay = true;
  active: string | null = null;
  chatId: string | null = null;
  private controller: AbortController | null = null;
  constructor(
    private readonly callbacks: {
      accepted(value: AcceptedSubmission): void;
      settled(): void;
      lifecycle(): Lifecycle;
    },
  ) {}
  async sendMessages(
    options: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0],
  ): Promise<ReadableStream<UIMessageChunk>> {
    const body = options.body as Record<string, unknown> | undefined;
    const submission = schemas.submitMessage.parse(body?.submission),
      chatId = body?.productChatId;
    if (typeof chatId !== "string" || !/^[A-Za-z0-9_-]+$/.test(chatId))
      throw new ApiError("INVALID_CONTRACT", "对话标识无效");
    let accepted: AcceptedSubmission;
    try {
      accepted = await read(
        "acceptedSubmission",
        `/snap/api/chats/${chatId}/messages`,
        submission,
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // An uncertain POST is never retried. Only query the durable receipt.
      try {
        accepted = await read(
          "acceptedSubmission",
          `/snap/api/requests/${submission.requestId}`,
        );
      } catch {
        throw new ApiError(
          "INTERRUPTED",
          "发送结果待确认；请检查状态，不要重复发送",
        );
      }
    }
    if (accepted.chatId !== chatId)
      throw new ApiError("PROTOCOL_MISMATCH", "发送回执与当前对话不一致");
    this.chatId = chatId;
    this.active = accepted.generationId;
    this.callbacks.accepted(accepted);
    const live = !accepted.deduplicated;
    if (live) this.callbacks.lifecycle().begin(accepted.generationId);
    return this.stream(accepted.generationId, options.abortSignal, live, false);
  }
  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    if (!this.active) return null;
    this.callbacks.lifecycle().cancel();
    return this.stream(this.active, undefined, false, true);
  }
  close(): void {
    this.controller?.abort();
    this.callbacks.lifecycle().cancel();
  }
  async stop(): Promise<void> {
    if (this.active)
      await read("generation", `/snap/api/generations/${this.active}/stop`, {
        apiVersion: 1,
      });
    this.close();
  }
  private stream(
    generationId: string,
    signal: AbortSignal | undefined,
    live: boolean,
    restore: boolean,
  ): ReadableStream<UIMessageChunk> {
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    const abort = (): void => {
      controller.abort();
    };
    signal?.addEventListener("abort", abort, { once: true });
    return new ReadableStream<UIMessageChunk>({
      start: (sink) => {
        const run = async (): Promise<void> => {
          let lastSeq = 0,
            messageId = "",
            started = false;
          const parts: { type: "text" | "reasoning"; text: string }[] = [],
            opened = new Set<number>();
          const start = (id: string): void => {
            if (!started) {
              messageId = id;
              started = true;
              sink.enqueue({ type: "start", messageId });
            }
          };
          const delta = (
            index: number,
            type: "text" | "reasoning",
            text: string,
          ): void => {
            const key = "part-" + index;
            if (!opened.has(index)) {
              opened.add(index);
              parts[index] = { type, text: "" };
              sink.enqueue(
                type === "text"
                  ? { type: "text-start", id: key }
                  : { type: "reasoning-start", id: key },
              );
            }
            const part = parts[index];
            if (!part || part.type !== type) throw new Error("PART_MISMATCH");
            part.text += text;
            sink.enqueue(
              type === "text"
                ? { type: "text-delta", id: key, delta: text }
                : { type: "reasoning-delta", id: key, delta: text },
            );
          };
          const snapshot = (g: Generation): void => {
            start(g.assistantMessageId);
            g.parts.forEach((p, index) => {
              if (p.type !== "image") delta(index, p.type, p.text);
            });
            lastSeq = g.lastSeq;
          };
          const finish = (status: Generation["status"]): void => {
            for (const index of opened) {
              const part = parts[index];
              if (part)
                sink.enqueue(
                  part.type === "text"
                    ? { type: "text-end", id: "part-" + index }
                    : { type: "reasoning-end", id: "part-" + index },
                );
            }
            if (live && status === "completed")
              this.callbacks.lifecycle().finish(
                generationId,
                parts
                  .filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join("\n"),
              );
            else this.callbacks.lifecycle().cancel();
            sink.enqueue({
              type: "finish",
              finishReason: status === "completed" ? "stop" : "other",
            });
            sink.close();
            this.callbacks.settled();
          };
          if (restore) {
            const g = await read(
              "generation",
              `/snap/api/generations/${generationId}`,
            );
            if (g.id !== generationId || g.chatId !== this.chatId)
              throw new Error("STREAM_IDENTITY");
            snapshot(g);
            if (
              ["completed", "stopped", "failed", "interrupted"].includes(
                g.status,
              )
            ) {
              finish(g.status);
              return;
            }
          }
          const result = await response(
            `/snap/api/generations/${generationId}/events?after=${lastSeq}`,
            { signal: controller.signal },
          );
          if (!result.body) throw new Error("MISSING_STREAM");
          const reader = result.body
            .pipeThrough(new TextDecoderStream())
            .getReader();
          let buffer = "",
            terminal = false;
          try {
            while (!terminal) {
              const next = await reader.read();
              if (next.done) break;
              buffer += next.value;
              if (buffer.length > 4_500_000)
                throw new Error("STREAM_TOO_LARGE");
              let end: number;
              while ((end = buffer.indexOf("\n\n")) >= 0) {
                const frame = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                const data = frame
                  .split("\n")
                  .filter((line) => line.startsWith("data: "))
                  .map((line) => line.slice(6))
                  .join("\n");
                if (!data) continue;
                const event: GenerationEvent = schemas.event.parse(
                  JSON.parse(data),
                );
                if (
                  event.chatId !== this.chatId ||
                  event.generationId !== generationId ||
                  (messageId && event.messageId !== messageId)
                )
                  throw new Error("STREAM_IDENTITY");
                if (
                  event.type === "snapshot" &&
                  (event.snapshot.id !== generationId ||
                    event.snapshot.chatId !== event.chatId ||
                    event.snapshot.assistantMessageId !== event.messageId ||
                    event.snapshot.lastSeq !== event.seq)
                )
                  throw new Error("SNAPSHOT_IDENTITY");
                if (event.seq <= lastSeq) continue;
                if (event.type !== "snapshot" && event.seq !== lastSeq + 1)
                  throw new Error("STREAM_GAP");
                start(event.messageId);
                if (event.type === "snapshot") {
                  if (opened.size) throw new Error("STREAM_RESET_REQUIRED");
                  snapshot(event.snapshot);
                  if (
                    ["completed", "stopped", "failed", "interrupted"].includes(
                      event.snapshot.status,
                    )
                  ) {
                    finish(event.snapshot.status);
                    terminal = true;
                    break;
                  }
                } else if (event.type === "delta")
                  delta(event.partIndex, event.partType, event.text);
                else if (event.type === "finish") {
                  finish(event.status);
                  terminal = true;
                  break;
                } else if (
                  event.type === "error" ||
                  event.type === "interrupted"
                ) {
                  this.callbacks.lifecycle().cancel();
                  throw new ApiError(event.error.code, event.error.error);
                }
                lastSeq = event.seq;
              }
            }
            if (!terminal)
              throw new ApiError(
                "INTERRUPTED",
                "连接中断；回答保留在电脑上，可继续接收",
              );
          } finally {
            await reader.cancel().catch(() => {});
          }
        };
        void run()
          .catch((error: unknown) => {
            this.callbacks.lifecycle().cancel();
            sink.error(error);
          })
          .finally(() => {
            signal?.removeEventListener("abort", abort);
          });
      },
      cancel: () => {
        controller.abort();
        this.callbacks.lifecycle().cancel();
      },
    });
  }
}
