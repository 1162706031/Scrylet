import React, { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { UIMessage } from "ai";
import type { Chat, Message } from "../../../contracts/index.js";
import { Icon } from "../Icon";
import { BrandMark } from "../BrandMark";

export async function copy(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* A LAN origin or denied permission may require the selection path. */
  }
  const element = document.createElement("textarea");
  element.value = text;
  element.style.position = "fixed";
  element.style.opacity = "0";
  document.body.append(element);
  element.select();
  const ok = document.execCommand("copy");
  element.remove();
  if (!ok) throw new Error("COPY_FAILED");
}
export function download(
  name: string,
  value: Blob | string,
  mime = "text/plain",
): void {
  const url = URL.createObjectURL(
    typeof value === "string" ? new Blob([value], { type: mime }) : value,
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function Code({
  text,
  language,
}: {
  text: string;
  language: string;
}): React.JSX.Element {
  const [error, setError] = useState(""), [copied, setCopied] = useState(false);
  return (
    <details className="code-block" open>
      <summary>
        <span className="code-language">{language || "代码"}</span>
        <span className="code-controls">
          <button
            type="button"
            aria-label="复制代码"
            onClick={(event) => {
              event.preventDefault();
              void copy(text)
                .then(() => setCopied(true))
                .catch(() => setError("可长按选择代码复制"));
            }}
          >
            <Icon name={copied ? "check" : "copy"} size={14} />
            {copied ? "已复制" : "复制代码"}
          </button>
          <button
            type="button"
            aria-label="保存代码"
            onClick={(event) => {
              event.preventDefault();
              download(
                "code." +
                  (language === "python"
                    ? "py"
                    : language === "javascript"
                      ? "js"
                      : "txt"),
                text,
              );
            }}
          >
            <Icon name="download" size={14} />保存代码
          </button>
          <span className="code-fold">折叠 / 展开</span>
        </span>
      </summary>
      <pre>
        <code>{text}</code>
      </pre>
      {error && <small>{error}</small>}
    </details>
  );
}
export function RichText({ text }: { text: string }): React.JSX.Element {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore" }]]}
      skipHtml
      components={{
        pre: ({ children }) => <div>{children}</div>,
        code: ({ children, className }) =>
          String(children).includes("\n") || className ? (
            <Code
              text={String(children).replace(/\n$/, "")}
              language={className?.replace("language-", "") || ""}
            />
          ) : (
            <code>{children}</code>
          ),
        a: ({ href, children }) => (
          <a
            href={
              href &&
              /^(https?:|mailto:|\/)/.test(href) &&
              !href.startsWith("//")
                ? href
                : undefined
            }
            target="_blank"
            rel="noreferrer"
          >
            {children}
          </a>
        ),
        img: ({ src, alt }) =>
          typeof src === "string" && src.startsWith("/snap/api/files/") ? (
            <img src={src} alt={alt || "消息图片"} loading="lazy" />
          ) : (
            <span>{alt || "外部图片未自动加载"}</span>
          ),
        table: ({ children }) => (
          <div className="table-scroll">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")}
    </Markdown>
  );
}

function Thinking(): React.JSX.Element {
  return (
    <div className="thinking" role="status" aria-label="Scrylet 正在思考">
      <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>
      <span>正在思考</span>
    </div>
  );
}

export function MessageList({
  messages,
  graph,
  busy,
  onEdit,
  onDelete,
  onRetry,
  onBranch,
  onPreview,
}: {
  messages: UIMessage[];
  graph: Chat | null;
  busy: boolean;
  onEdit(message: Message): void;
  onDelete(message: Message): void;
  onRetry(message: Message, style: "retry" | "detail" | "concise"): void;
  onBranch(id: string): void;
  onPreview(src: string): void;
}): React.JSX.Element {
  const [copyError, setCopyError] = useState(""), [copied, setCopied] = useState("");
  const waiting = busy && (!messages.length || messages.at(-1)?.role === "user");
  return (
    <section
      className="messages"
      aria-label="对话消息"
      role="log"
      aria-live="polite"
    >
      {messages.map((message, messageIndex) => {
        const record = graph?.messages.find((m) => m.id === message.id),
          siblings = record
            ? graph?.messages.filter(
                (m) =>
                  m.role === record.role &&
                  m.parentMessageId === record.parentMessageId,
              ) || []
            : [];
        const position = siblings.findIndex((m) => m.id === record?.id),
          text = message.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("\n"),
          streaming = busy && messageIndex === messages.length - 1 && message.role === "assistant";
        return (
          <article
            className={"message " + message.role + (streaming ? " streaming" : "")}
            key={message.id}
            data-message-id={message.id}
          >
            <header>
              {message.role === "assistant" && (
                <span className="assistant-mark" aria-hidden="true"><BrandMark size={23} /></span>
              )}
              <strong>{message.role === "user" ? "你" : "Scrylet"}</strong>
              {record?.modelId && <small>{record.modelId}</small>}
              {record?.status &&
                ["stopped", "failed", "interrupted"].includes(
                  record.status,
                ) && (
                  <span className="state-tag">
                    {record.status === "stopped"
                      ? "已停止"
                      : record.status === "failed"
                        ? "生成失败"
                        : "已中断，未自动重发"}
                  </span>
                )}
            </header>
            <div className="message-parts">
              {message.parts.map((part, index) =>
                part.type === "text" ? (
                  <RichText key={index} text={part.text} />
                ) : part.type === "reasoning" ? (
                  <details className="reasoning" key={index}>
                    <summary>推理内容</summary>
                    <RichText text={part.text} />
                  </details>
                ) : part.type === "file" ? (
                  <button
                    className="message-image"
                    key={index}
                    aria-label="查看消息图片"
                    onClick={() => onPreview(part.url)}
                  >
                    <img src={part.url} alt="消息图片" />
                  </button>
                ) : null,
              )}
              {streaming && !text.trim() && <Thinking />}
              {streaming && text.trim() && <span className="streaming-caret" aria-hidden="true" />}
            </div>
            <footer className="message-actions">
              <button
                className="message-action copy-action"
                aria-label="复制"
                onClick={() =>
                  void copy(text)
                    .then(() => setCopied(message.id))
                    .catch(() =>
                      setCopyError("复制失败，请长按选择文字复制"),
                    )
                }
              >
                <Icon name={copied === message.id ? "check" : "copy"} size={15} />
                <span>{copied === message.id ? "已复制" : "复制"}</span>
              </button>
              {record && (
                <>
                  <button
                    className="message-action compact-action"
                    aria-label="编辑消息"
                    title="编辑消息"
                    disabled={busy}
                    onClick={() => onEdit(record)}
                  >
                    <Icon name="edit" size={15} /><span className="sr-only">编辑消息</span>
                  </button>
                  <button
                    className="message-action compact-action delete-action"
                    aria-label="删除消息"
                    title="删除消息"
                    disabled={busy}
                    onClick={() => onDelete(record)}
                  >
                    <Icon name="trash" size={15} /><span className="sr-only">删除消息</span>
                  </button>
                  {record.role === "assistant" && (
                    <details className="retry-menu">
                      <summary aria-label="重新生成">
                        <Icon name="refresh" size={15} />重新生成
                      </summary>
                      <div>
                        {(
                          [
                            ["retry", "重试"],
                            ["detail", "添加详情"],
                            ["concise", "精炼表达"],
                          ] as const
                        ).map(([style, label]) => (
                          <button
                            disabled={busy}
                            key={style}
                            onClick={() => onRetry(record, style)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
              {siblings.length > 1 && (
                <span className="branches">
                  <button
                    aria-label="上一条消息"
                    disabled={busy || position <= 0}
                    onClick={() => {
                      const m = siblings[position - 1];
                      if (m) onBranch(m.id);
                    }}
                  >
                    <Icon name="chevron-left" size={16} />
                  </button>
                  <span>{position + 1} / {siblings.length}</span>
                  <button
                    aria-label="下一条消息"
                    disabled={busy || position >= siblings.length - 1}
                    onClick={() => {
                      const m = siblings[position + 1];
                      if (m) onBranch(m.id);
                    }}
                  >
                    <Icon name="chevron-right" size={16} />
                  </button>
                </span>
              )}
            </footer>
          </article>
        );
      })}
      {waiting && (
        <article className="message assistant thinking-message">
          <header><span className="assistant-mark"><BrandMark size={23} /></span><strong>Scrylet</strong></header>
          <Thinking />
        </article>
      )}
      {copyError && <p className="copy-error" role="status">{copyError}</p>}
    </section>
  );
}
