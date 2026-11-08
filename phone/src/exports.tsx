import type { Chat } from "../../contracts/index.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { branch } from "./chat/transport";
import { download, RichText } from "./chat/MessageList";
export async function exportChat(
  chat: Chat,
  format: "json" | "txt" | "pdf",
): Promise<void> {
  const name = chat.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "对话";
  if (format === "json") {
    const nodes = Object.fromEntries(
      chat.messages.map((m) => [
        m.id,
        {
          id: m.id,
          role: m.role,
          parentId: m.parentMessageId,
          childrenIds: chat.messages
            .filter((child) => child.parentMessageId === m.id)
            .map((child) => child.id),
          content: m.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("\n"),
          files: m.parts
            .filter((p) => p.type === "image")
            .map((p) => ({
              type: "image",
              url: "/snap/api/files/" + p.fileId,
            })),
          timestamp: Math.floor(m.createdAt / 1000),
          model: m.modelId,
          done: !["accepted", "requesting", "streaming"].includes(
            m.status || "",
          ),
        },
      ]),
    );
    download(
      name + ".json",
      JSON.stringify(
        [
          {
            id: chat.id,
            title: chat.title,
            pinned: chat.pinned,
            archived: chat.archived,
            current_message_id: chat.currentMessageId,
            created_at: Math.floor(chat.createdAt / 1000),
            updated_at: Math.floor(chat.updatedAt / 1000),
            chat: {
              title: chat.title,
              models: [chat.modelId],
              history: { currentId: chat.currentMessageId, messages: nodes },
              messages: branch(chat.messages, chat.currentMessageId).map(
                (m) => nodes[m.id],
              ),
            },
            scrylet: { apiVersion: 1, graph: chat },
          },
        ],
        null,
        2,
      ),
      "application/json",
    );
    return;
  }
  const text = branch(chat.messages, chat.currentMessageId)
    .map(
      (m) =>
        `${m.role === "user" ? "你" : "Scrylet"}\n${m.parts.map((p) => (p.type === "image" ? `[图片 ${p.fileId}]` : p.text)).join("\n")}`,
    )
    .join("\n\n");
  if (format === "txt") {
    download(name + ".txt", text);
    return;
  }
  // Render the selected export snapshot, even when another chat is on screen.
  // This read-only document owns no composer or SDK state.
  const element = document.createElement("div");
  element.className = "export-document";
  element.style.cssText =
    "position:absolute;left:-10000px;top:0;width:794px;padding:35px;background:#fff;color:#172640";
  document.body.append(element);
  const root = createRoot(element);
  flushSync(() =>
    root.render(
      <>
        <h1>{chat.title}</h1>
        {branch(chat.messages, chat.currentMessageId).map((message) => (
          <article className="message" key={message.id}>
            <h3>{message.role === "user" ? "你" : "Scrylet"}</h3>
            {message.parts.map((part, index) =>
              part.type === "image" ? (
                <img
                  style={{ maxWidth: "100%", maxHeight: 700 }}
                  key={index}
                  src={"/snap/api/files/" + part.fileId}
                  alt="消息图片"
                />
              ) : part.type === "text" ? (
                <RichText key={index} text={part.text} />
              ) : null,
            )}
          </article>
        ))}
      </>,
    ),
  );
  try {
    await Promise.all([
      document.fonts.ready,
      ...Array.from(element.querySelectorAll("img")).map((image) =>
        image.decode(),
      ),
    ]);
    const [{ default: html2canvas }, { PDFDocument }] = await Promise.all([
      import("html2canvas"),
      import("pdf-lib"),
    ]);
    const canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 1.5,
      logging: false,
      useCORS: false,
      onclone: (doc) => {
        for (const item of doc.querySelectorAll(
          ".export-document button,.export-document .code-controls",
        ))
          item.remove();
        for (const code of doc.querySelectorAll<HTMLElement>("pre")) {
          code.style.whiteSpace = "pre-wrap";
          code.style.overflow = "visible";
        }
      },
    });
    const pdf = await PDFDocument.create(),
      pageHeight = Math.floor((canvas.width * 842) / 595);
    for (let y = 0; y < canvas.height; y += pageHeight) {
      const tile = document.createElement("canvas");
      tile.width = canvas.width;
      tile.height = Math.min(pageHeight, canvas.height - y);
      const context = tile.getContext("2d");
      if (!context) throw new Error("CANVAS_FAILED");
      context.drawImage(
        canvas,
        0,
        y,
        tile.width,
        tile.height,
        0,
        0,
        tile.width,
        tile.height,
      );
      const image = await pdf.embedJpg(tile.toDataURL("image/jpeg", 0.93)),
        page = pdf.addPage([595, 842]);
      const height = (tile.height * 595) / tile.width;
      page.drawImage(image, { x: 0, y: 842 - height, width: 595, height });
    }
    const bytes = await pdf.save();
    download(
      name + ".pdf",
      new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    );
  } finally {
    root.unmount();
    element.remove();
  }
}
