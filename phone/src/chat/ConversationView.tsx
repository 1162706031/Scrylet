import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  Message,
  PublicModel,
  PublicStatus,
  Prompt,
} from "../../../contracts/index.js";
import { json, messageOf, schemas, read } from "../api";
import { Conversation, useConversation } from "./useConversation";
import { useComposer } from "./useComposer";
import { MessageList, copy } from "./MessageList";
import { CaptureControls } from "../attachments/Capture";
import { uploadSelection } from "../attachments/images";
import { useDesktopReceiver } from "../capture/desktopReceiver";
import { usePhoneSpeech, SpeechControls } from "../audio/ReadAloud";
import { Icon } from "../Icon";

function resizeEditor(element: HTMLTextAreaElement | null): void {
  if (!element) return;
  element.style.height = "auto";
  const limit = (visualViewport?.height || innerHeight) <= 540 ? 80 : 164,
    height = Math.min(element.scrollHeight, limit);
  element.style.height = height + "px";
  element.style.overflowY = element.scrollHeight > limit ? "auto" : "hidden";
}

export function ConversationView({
  routeId,
  models,
  status,
  statusError,
  clientId,
  changed,
  navigate,
}: {
  routeId: string | null;
  models: PublicModel[];
  status: PublicStatus | null;
  statusError: string;
  clientId: string;
  changed(): void;
  navigate(id: string | null): void;
}): React.JSX.Element {
  const controller = useMemo(
      () => new Conversation(routeId, models, changed),
      [],
    ),
    conversation = useConversation(controller),
    composer = controller.composer,
    draft = useComposer(composer);
  const [editing, setEditing] = useState<Message | null>(null),
    [editText, setEditText] = useState(""),
    [preview, setPreview] = useState<string | null>(null),
    [zoom, setZoom] = useState(1),
    [promptList, setPrompts] = useState<Prompt[]>([]),
    [commands, setCommands] = useState<Prompt[]>([]),
    [notice, setNotice] = useState("");
  const end = useRef<HTMLDivElement>(null),
    editor = useRef<HTMLTextAreaElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    followLatest = useRef(true),
    lastScrollTop = useRef(0);
  const [showLatest, setShowLatest] = useState(false);
  const maintainScroll = useCallback((): void => {
    const element = scroll.current;
    if (!element) return;
    const distance = element.scrollHeight - element.clientHeight - element.scrollTop;
    // Streaming can render before WebKit dispatches a queued scroll event.
    // Detect upward movement here too, before moving the reader to the bottom.
    if (element.scrollTop < lastScrollTop.current - 1 && distance > 64) {
      followLatest.current = false;
      setShowLatest(true);
    }
    if (followLatest.current && element.querySelector(".message"))
      element.scrollTop = element.scrollHeight;
    lastScrollTop.current = element.scrollTop;
  }, []);
  const connected = Boolean(status?.ready && !status.paused && !statusError),
    configured = models.some((m) => m.id === draft.modelId && m.configured),
    busy = controller.generating;
  controller.models = models;
  const speech = usePhoneSpeech();
  controller.lifecycle = speech.lifecycle;
  useDesktopReceiver(controller, clientId, connected && configured);
  useEffect(() => {
    void controller.load();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    let active = true;
    if (connected)
      void json("/snap/api/prompts")
        .then((value) => {
          if (active && Array.isArray(value))
            setCommands(value.map((p) => schemas.prompt.parse(p)));
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [connected]);
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current) void controller.load(false);
    wasConnected.current = connected;
  }, [connected, controller]);
  useEffect(() => {
    const save = (): void => composer.cacheLocal();
    addEventListener("pagehide", save);
    return () => removeEventListener("pagehide", save);
  }, [composer]);
  useEffect(() => {
    const update = (): void => {
      const viewport = visualViewport;
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      document.documentElement.style.setProperty(
        "--phone-height",
        (viewport?.height || innerHeight) + "px",
      );
      document.documentElement.style.setProperty(
        "--phone-top",
        (viewport?.offsetTop || 0) + "px",
      );
      document.documentElement.classList.toggle("compact-viewport", (viewport?.height || innerHeight) <= 540);
      resizeEditor(editor.current);
    };
    update();
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    addEventListener("resize", update);
    return () => {
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      removeEventListener("resize", update);
    };
  }, []);
  useLayoutEffect(() => resizeEditor(editor.current), [draft.text]);
  useLayoutEffect(() => {
    maintainScroll();
  }, [conversation.messages, conversation.loading, busy, maintainScroll]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(maintainScroll);
    observer.observe(element);
    const messages = element.querySelector(".messages");
    if (messages) observer.observe(messages);
    return () => observer.disconnect();
  }, [maintainScroll]);
  useEffect(() => {
    const element = document.querySelector<HTMLElement>(".composer");
    if (!element) return;
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty(
        "--composer-height",
        element.getBoundingClientRect().height + "px",
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const attempt = (action: () => Promise<unknown>): void => {
    void action().catch((error) => setNotice(messageOf(error)));
  };
  const chooseBranch = (messageId: string): void =>
    controller.selectBranch(messageId);
  const suggestions = /^\/[A-Za-z0-9_-]*$/.test(draft.text)
    ? commands.filter((prompt) => prompt.command.startsWith(draft.text))
    : [];
  const upload = async (files: File[]): Promise<void> => {
    if (draft.images.length + files.length > 12) {
      setNotice("每次最多添加 12 张图片，整批未添加");
      return;
    }
    await composer.process(async () => {
      const images = [];
      for (const file of files) images.push(await uploadSelection(file));
      return images;
    });
  };
  return (
    <main className="conversation">
      <div className="conversation-heading">
        <div>
          <span className={"eyebrow connection-state" + (connected ? " connected" : "")}>
            <span className="status-dot" aria-hidden="true" />
            {connected ? "已连接电脑" : "等待恢复连接"}
          </span>
          <h1 title={conversation.graph?.title}>{conversation.graph?.title || "新对话"}</h1>
        </div>
        <span className="settings-link" title="请在电脑 App 的模型服务中管理 API Key">
          <Icon name="settings" size={15} />电脑端设置模型
        </span>
        {conversation.graph && (
          <details className="conversation-menu">
            <summary aria-label="对话操作"><Icon name="more" size={20} /></summary>
            <div>
              <button
                onClick={() =>
                  attempt(() =>
                    copy(
                      conversation.messages
                        .map((m) =>
                          m.parts
                            .filter((p) => p.type === "text")
                            .map((p) => p.text)
                            .join("\n"),
                        )
                        .join("\n\n"),
                    ),
                  )
                }
              >
                复制对话
              </button>
              {(["json", "txt", "pdf"] as const).map((format) => (
                <button
                  key={format}
                  onClick={() =>
                    attempt(async () => {
                      if (controller.graph)
                        await (
                          await import("../exports")
                        ).exportChat(controller.graph, format);
                    })
                  }
                >
                  下载 {format.toUpperCase()}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
      <SpeechControls speech={speech} />
      {(statusError || status?.paused || !status?.ready) && (
        <div className="connection-banner" role="status">
          <span>
            {statusError ||
              (status?.paused
                ? "电脑已暂停手机访问；草稿已保留"
                : status?.error
                  ? "电脑服务暂不可用，请查看电脑 App；草稿已保留"
                  : "电脑服务正在启动，草稿已保留")}
          </span>
          <a
            href={
              "/snap/pair?returnTo=" + encodeURIComponent(location.pathname)
            }
          >
            重新配对
          </a>
          <button onClick={() => attempt(() => controller.load(false))}>
            刷新状态
          </button>
        </div>
      )}
      <div
        className="history-scroll"
        id="conversation-export"
        ref={scroll}
        onScroll={() => {
          const element = scroll.current;
          if (!element) return;
          const nearBottom = element.scrollHeight - element.clientHeight - element.scrollTop < 64;
          followLatest.current = nearBottom;
          lastScrollTop.current = element.scrollTop;
          setShowLatest(!nearBottom);
        }}
      >
        {!conversation.messages.length && (
          <section className="empty">
            <span className="empty-icon"><Icon name="spark" size={34} /></span>
            <span className="section-kicker">一点好奇，无限可能</span>
            <h2>把问题，聊清楚。</h2>
            <p>屏幕上的难题，脑海中的想法。<br />和 Scrylet 一起，慢慢理出头绪。</p>
            <div className="welcome-actions">
              <button disabled={conversation.loading} onClick={() => editor.current?.focus()}>
                <Icon name="prompt" size={19} />
                <span><strong>从一个问题开始</strong><small>写下你现在想弄懂的事</small></span>
                <Icon name="chevron-right" size={16} />
              </button>
              <button disabled={conversation.loading || !!draft.processing} onClick={() => document.getElementById("image-upload")?.click()}>
                <Icon name="image" size={19} />
                <span><strong>让图片帮你表达</strong><small>选一张图，一起看懂细节</small></span>
                <Icon name="chevron-right" size={16} />
              </button>
            </div>
            <span className="welcome-note">截图和选图会先加入草稿，由你决定何时发送</span>
          </section>
        )}
        <MessageList
          messages={conversation.messages}
          graph={conversation.graph}
          busy={busy}
          onEdit={(message) => {
            setEditing(message);
            setEditText(
              message.parts
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("\n"),
            );
          }}
          onDelete={(message) => {
            if (confirm("删除这条消息及其直接回答？其他分支会保留。"))
              attempt(async () => {
                const graph = controller.graph;
                if (graph) {
                  await read(
                    "chat",
                    `/snap/api/chats/${graph.id}/messages/${message.id}`,
                    { apiVersion: 1, version: graph.version },
                    "DELETE",
                  );
                  await controller.load(false);
                }
              });
          }}
          onRetry={(message, style) =>
            attempt(() =>
              controller.submit({
                action: "regenerate",
                targetMessageId: message.id,
                style,
              }),
            )
          }
          onBranch={chooseBranch}
          onPreview={(src) => {
            setZoom(1);
            setPreview(src);
          }}
        />
        <div ref={end} />
      </div>
      <button
        className="latest"
        hidden={!showLatest || !conversation.messages.length}
        aria-label="跳到最新回复"
        onClick={() => {
          followLatest.current = true;
          const element = scroll.current;
          if (element) {
            element.scrollTop = element.scrollHeight;
            lastScrollTop.current = element.scrollTop;
          }
          setShowLatest(false);
        }}
      >
        <Icon name="arrow-down" size={15} />最新回复
      </button>
      <section className="composer" aria-label="消息草稿">
        {(!!draft.images.length || composer.canUndo()) && (
          <div className="attachment-heading">
            <span>{draft.images.length} 张待发送</span>
            <button
              onClick={() => composer.remove(draft.images.map((f) => f.fileId))}
            >
              清空待发送图片
            </button>
            <button
              onClick={() => {
                try {
                  composer.undo();
                } catch (error) {
                  setNotice(messageOf(error));
                }
              }}
            >
              撤销删除
            </button>
          </div>
        )}
        <div className="attachments">
          {draft.images.map((file, index) => (
            <div className="attachment" key={file.fileId}>
              <button
                onClick={() => {
                  setZoom(1);
                  setPreview("/snap/api/files/" + file.fileId);
                }}
                aria-label={"预览第 " + (index + 1) + " 张图片"}
              >
                {file.unresolved ? (
                  <span className="unresolved-image">旧图片待迁移</span>
                ) : (
                  <img src={"/snap/api/files/" + file.fileId} alt={file.name} />
                )}
                <span>{index + 1}</span>
              </button>
              <button
                className="remove"
                aria-label={"移除第 " + (index + 1) + " 张图片"}
                onClick={() => composer.remove([file.fileId])}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {connected && status?.permission !== "granted" && (
          <p className="permission-note">
            请在电脑 App 中检查屏幕录制权限；仍可选图或输入问题。
          </p>
        )}
        {!!suggestions.length && (
          <div
            className="prompt-suggestions"
            role="listbox"
            aria-label="提示词建议"
          >
            {suggestions.map((prompt) => (
              <button
                key={prompt.id}
                role="option"
                aria-selected={false}
                onClick={() => {
                  composer.text(prompt.content);
                  editor.current?.focus();
                }}
              >
                {prompt.command} · {prompt.name}
              </button>
            ))}
          </div>
        )}
        <textarea
          id="chat-input"
          ref={editor}
          aria-label="消息输入"
          value={draft.text}
          disabled={conversation.loading}
          placeholder="输入问题，或添加截图…"
          rows={1}
          onChange={(event) => composer.text(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (suggestions[0]) composer.text(suggestions[0].content);
              else if (
                !busy &&
                connected &&
                !draft.processing &&
                !draft.submitting
              ) {
                followLatest.current = true;
                attempt(() => composer.send());
              }
            }
          }}
        />
        {draft.legacyAvailable && (
          <div className="legacy-draft">
            旧版草稿仍完整保留。
            <button
              onClick={() => {
                if (
                  (!draft.text && !draft.images.length) ||
                  confirm("将旧草稿恢复到输入区？当前输入会另存备份。")
                )
                  attempt(() => composer.importLegacy());
              }}
            >
              恢复旧草稿
            </button>
          </div>
        )}
        <div className="composer-tools">
          <CaptureControls
            composer={composer}
            status={status}
            disabled={
              !connected ||
              !configured ||
              conversation.loading ||
              draft.processing > 0
            }
            notify={setNotice}
          />
          <label className={draft.processing ? "disabled" : ""}>
            <Icon name="image" size={17} />选图
            <input
              id="image-upload"
              aria-label="选择图片"
              type="file"
              accept="image/*"
              multiple
              disabled={conversation.loading || draft.processing > 0}
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                if (files.length) attempt(() => upload(files));
              }}
            />
          </label>
          <button
            onClick={() =>
              attempt(async () => {
                const value = await json("/snap/api/prompts");
                if (Array.isArray(value))
                  setPrompts(value.map((p) => schemas.prompt.parse(p)));
              })
            }
          >
            <Icon name="prompt" size={17} />提示词
          </button>

        </div>
        <div className="composer-bottom">
          <div className="model-picker">
            <Icon name="spark" size={14} />
          <select
            aria-label="当前模型"
            value={draft.modelId}
            disabled={conversation.loading}
            onChange={(event) => composer.model(event.target.value)}
          >
            {models.map((model) => (
              <option
                key={model.id}
                value={model.id}
                disabled={!model.configured}
              >
                {model.name}
                {model.configured ? "" : " · 未连接"}
              </option>
            ))}
          </select>
          </div>
          <span className="draft-state" role="status">
            {draft.processing ? "正在处理图片…" : draft.saveState}
          </span>
          {busy ? (
            <button
              className="send stop-send"
              aria-label="停止生成"
              disabled={!connected}
              onClick={() => attempt(() => controller.stop())}
            >
              <Icon name="stop" size={17} />
            </button>
          ) : (
            <button
              aria-label="发送消息"
              id="send-message-button"
              className="send"
              disabled={
                !connected ||
                !configured ||
                conversation.loading ||
                !!draft.processing ||
                draft.submitting ||
                !!draft.uncertain ||
                (!draft.text.trim() && !draft.images.length)
              }
              onClick={() => { followLatest.current = true; attempt(() => composer.send()); }}
            >
              <Icon name="arrow-up" size={20} />
            </button>
          )}
        </div>
        {draft.uncertain && (
          <div className="uncertain" role="status">
            发送结果待确认；不会自动重发。
            <button onClick={() => attempt(() => controller.confirm())}>
              检查发送状态
            </button>
          </div>
        )}
        {(notice ||
          conversation.error ||
          draft.error ||
          (conversation.error === "" && conversation.status === "error")) && (
          <div className="inline-error" role="alert">
            {notice ||
              conversation.error ||
              draft.error ||
              "连接已中断，回答仍保留在电脑"}
            <button onClick={() => attempt(() => controller.resume())}>
              继续接收
            </button>
            <button
              aria-label="关闭提示"
              onClick={() => {
                setNotice("");
                controller.set({ error: "" });
                composer.set({ error: "" });
              }}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
      </section>
      {editing && (
        <div className="modal-backdrop">
          <form
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="编辑消息"
            onSubmit={(e) => {
              e.preventDefault();
              attempt(async () => {
                const graph = controller.graph;
                if (!graph) return;
                await read(
                  "chat",
                  `/snap/api/chats/${graph.id}/messages/${editing.id}`,
                  {
                    apiVersion: 1,
                    version: graph.version,
                    parts: [
                      { type: "text", text: editText },
                      ...editing.parts.filter((p) => p.type !== "text"),
                    ],
                  },
                  "PATCH",
                );
                setEditing(null);
                await controller.load(false);
              });
            }}
          >
            <h2>编辑消息</h2>
            <textarea
              aria-label="编辑消息内容"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
            />
            <footer>
              <button type="button" onClick={() => setEditing(null)}>
                取消
              </button>
              <button type="submit">保存</button>
              {editing.role === "user" && (
                <button
                  type="button"
                  onClick={() => {
                    attempt(async () => {
                      await controller.submit({
                        action: "edit",
                        targetMessageId: editing.id,
                        text: editText,
                      });
                      setEditing(null);
                    });
                  }}
                >
                  发送
                </button>
              )}
            </footer>
          </form>
        </div>
      )}
      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <section
            className="dialog image-preview"
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <strong>图片预览</strong>
              <button
                aria-label="关闭图片预览"
                onClick={() => setPreview(null)}
              >
                ×
              </button>
            </header>
            <div className="preview-scroll">
              <img
                src={preview}
                alt="大图预览"
                style={{ width: zoom * 100 + "%" }}
              />
            </div>
            <footer>
              <button
                onClick={() => {
                  const all = draft.images.map(
                    (f) => "/snap/api/files/" + f.fileId,
                  );
                  const index = all.indexOf(preview);
                  if (all.length)
                    setPreview(
                      all[(index - 1 + all.length) % all.length] || null,
                    );
                }}
              >
                上一张
              </button>
              <button
                aria-label="缩小图片"
                onClick={() => setZoom((n) => Math.max(1, n - 0.5))}
              >
                －
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="放大图片"
                onClick={() => setZoom((n) => Math.min(4, n + 0.5))}
              >
                ＋
              </button>
              <button
                onClick={() => {
                  const all = draft.images.map(
                    (f) => "/snap/api/files/" + f.fileId,
                  );
                  const index = all.indexOf(preview);
                  if (all.length)
                    setPreview(all[(index + 1) % all.length] || null);
                }}
              >
                下一张
              </button>
            </footer>
          </section>
        </div>
      )}
      {!!promptList.length && (
        <div className="modal-backdrop">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="选择提示词"
          >
            <header>
              <h2>选择提示词</h2>
              <button aria-label="关闭提示词" onClick={() => setPrompts([])}>
                ×
              </button>
            </header>
            {promptList.map((prompt) => (
              <button
                className="prompt-choice"
                key={prompt.id}
                onClick={() => {
                  composer.text(
                    draft.text + (draft.text ? "\n" : "") + prompt.content,
                  );
                  setPrompts([]);
                  editor.current?.focus();
                }}
              >
                {prompt.name}
                <small>{prompt.command}</small>
              </button>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
