// M0.3 build/SDK probe only. This is not served by the product gateway.
import React from "react";
import { createRoot } from "react-dom/client";
import { useChat } from "@ai-sdk/react";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import "../../web/tokens.css";
import "./compatibility.css";

const transport: ChatTransport<UIMessage> = {
  async sendMessages({ abortSignal }) {
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        let finished = false;
        const abort = () => { if (!finished) { finished = true; controller.error(new DOMException("Aborted", "AbortError")); } };
        abortSignal?.addEventListener("abort", abort, { once: true });
        controller.enqueue({ type: "start", messageId: "compat-answer" });
        controller.enqueue({ type: "text-start", id: "compat-text" });
        controller.enqueue({ type: "text-delta", id: "compat-text", delta: "兼容实验通过" });
        setTimeout(() => {
          abortSignal?.removeEventListener("abort", abort);
          if (finished) return;
          finished = true;
          controller.enqueue({ type: "text-end", id: "compat-text" });
          controller.enqueue({ type: "finish", finishReason: "stop" });
          controller.close();
        }, 100);
      },
    });
  },
  async reconnectToStream() { return null; },
};

function CompatibilityProbe() {
  const { messages, status, sendMessage, error } = useChat({ transport });
  return <main>
    <p className="eyebrow">Scrylet · M0.3</p>
    <h1>运行层兼容实验</h1>
    <p>仅验证前端构建与 SDK 状态，不是手机聊天入口。</p>
    <button disabled={messages.length > 0} onClick={() => void sendMessage({ text: "compatibility fixture" })}>验证 SDK 聊天状态</button>
    <p role="status" aria-label="SDK 状态">{status}</p>
    <output aria-label="消息数">{messages.length}</output>
    <section role="log">{messages.filter(message => message.role === "assistant").map(message =>
      <p key={message.id}>{message.parts.filter(part => part.type === "text").map(part => part.text).join("")}</p>)}</section>
    {error && <p role="alert">兼容实验失败</p>}
  </main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing compatibility root");
createRoot(root).render(<CompatibilityProbe />);
