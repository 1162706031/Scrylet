import React, { useEffect, useState } from "react";
import type { Chat } from "../../../contracts/index.js";
import { json, messageOf, read, remember, stored } from "../api";
import { Icon } from "../Icon";
import { copy } from "./MessageList";

function chatTime(timestamp: number): string {
  const date = new Date(timestamp),
    now = new Date(),
    sameDay = date.toDateString() === now.toDateString();
  if (sameDay)
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

export function HistoryPanel({
  onClose,
  navigate,
  version,
  currentId,
}: {
  onClose(): void;
  navigate(id: string | null): void;
  version: number;
  currentId: string | null;
}): React.JSX.Element {
  const [chats, setChats] = useState<Chat[]>([]),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(""),
    [menu, setMenu] = useState<string | null>(null),
    [rename, setRename] = useState<Chat | null>(null),
    [title, setTitle] = useState(""),
    [share, setShare] = useState<Chat | null>(null);
  const load = async (append = false): Promise<void> => {
    setLoading(true);
    try {
      const page = await read(
        "chatPage",
        `/snap/api/chats?limit=30&archived=${archived}&search=${encodeURIComponent(search)}${append && cursor ? "&cursor=" + cursor : ""}`,
      );
      setChats((old) => (append ? [...old, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [search, archived, version]);
  const action = (fn: () => Promise<unknown>): void => {
    setMenu(null);
    void fn()
      .then(() => load())
      .catch((cause) => setError(messageOf(cause)));
  };
  const patch = (chat: Chat, fields: object): Promise<Chat> =>
    read(
      "chat",
      `/snap/api/chats/${chat.id}`,
      { apiVersion: 1, version: chat.version, ...fields },
      "PATCH",
    );
  const exportChat = async (
    chat: Chat,
    format: "json" | "txt" | "pdf",
  ): Promise<void> => {
    const exports = await import("../exports");
    await exports.exportChat(chat, format);
  };
  return (
    <div className="modal-backdrop history-backdrop" onClick={onClose}>
      <aside
        className="history-panel"
        role="dialog"
        aria-modal="true"
        aria-label="历史对话"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="history-header">
          <div>
            <span className="section-kicker">SCRYLET</span>
            <h2>对话记录</h2>
          </div>
          <button className="icon-button" aria-label="关闭历史" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <button className="new-chat" onClick={() => navigate(null)}>
          <Icon name="plus" size={18} />
          新对话
        </button>
        <label className="history-search">
          <Icon name="search" size={18} />
          <input
            aria-label="搜索对话"
            placeholder="搜索对话和消息"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button aria-label="清空搜索" onClick={() => setSearch("")}>
              <Icon name="close" size={15} />
            </button>
          )}
        </label>
        <div className="history-filters">
          <div className="segmented-control" aria-label="对话筛选">
            <button aria-pressed={!archived} onClick={() => setArchived(false)}>
              对话
            </button>
            <button aria-pressed={archived} onClick={() => setArchived(true)}>
              已归档
            </button>
          </div>
          <button
            className="mark-read"
            onClick={() =>
              action(() => json("/snap/api/chats/read", { apiVersion: 1 }))
            }
          >
            标记全部已读
          </button>
        </div>
        {error && <p className="history-error" role="alert">{error}</p>}
        <details
          className="history-list-section"
          open={stored("snap.historyExpanded") !== "false"}
          onToggle={(event) =>
            remember("snap.historyExpanded", String(event.currentTarget.open))
          }
        >
          <summary>
            <span>{archived ? "归档的对话" : "全部对话"}</span>
            <span className="history-count">{chats.length}</span>
          </summary>
          <ul>
            {chats.map((chat) => (
              <li key={chat.id} className={currentId === chat.id ? "current" : ""}>
                <a
                  href={"/c/" + chat.id}
                  aria-current={currentId === chat.id ? "page" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(chat.id);
                  }}
                >
                  <span className="history-item-topline">
                    <span className="history-title">
                      {chat.pinned && (
                        <span className="pinned" aria-label="已置顶">
                          <Icon name="pin" size={13} />
                        </span>
                      )}
                      {chat.title}
                    </span>
                    {(chat.lastReadAt === null ||
                      chat.updatedAt > chat.lastReadAt) && (
                      <span className="unread" aria-label="未读" />
                    )}
                  </span>
                  <time dateTime={new Date(chat.updatedAt).toISOString()}>
                    {chatTime(chat.updatedAt)}
                  </time>
                </a>
                <button
                  className="history-more"
                  aria-label={"对话菜单 " + chat.title}
                  aria-expanded={menu === chat.id}
                  onClick={() => setMenu(menu === chat.id ? null : chat.id)}
                >
                  <Icon name="more" size={19} />
                </button>
                {menu === chat.id && (
                  <menu>
                    <button
                      onClick={() => {
                        setRename(chat);
                        setTitle(chat.title);
                        setMenu(null);
                      }}
                    >
                      <Icon name="edit" size={16} />重命名
                    </button>
                    <button
                      onClick={() =>
                        action(() => patch(chat, { pinned: !chat.pinned }))
                      }
                    >
                      <Icon name="pin" size={16} />{chat.pinned ? "取消置顶" : "置顶"}
                    </button>
                    <button
                      onClick={() =>
                        action(() => patch(chat, { lastReadAt: 0 }))
                      }
                    >
                      <span className="menu-dot" />标记为未读
                    </button>
                    <button
                      onClick={() =>
                        action(() => patch(chat, { archived: !chat.archived }))
                      }
                    >
                      <Icon name="archive" size={16} />{chat.archived ? "恢复归档" : "归档"}
                    </button>
                    <button
                      onClick={() =>
                        action(async () => {
                          const clone = await read(
                            "chat",
                            `/snap/api/chats/${chat.id}/clone`,
                            { apiVersion: 1 },
                          );
                          navigate(clone.id);
                        })
                      }
                    >
                      <Icon name="copy" size={16} />克隆
                    </button>
                    <button
                      onClick={() => {
                        setShare(chat);
                        setMenu(null);
                      }}
                    >
                      <Icon name="share" size={16} />分享
                    </button>
                    <div className="menu-separator" />
                    {(["json", "txt", "pdf"] as const).map((format) => (
                      <button
                        key={format}
                        onClick={() => action(() => exportChat(chat, format))}
                      >
                        <Icon name="download" size={16} />下载 {format.toUpperCase()}
                      </button>
                    ))}
                    <div className="menu-separator" />
                    <button
                      className="danger-action"
                      onClick={() => {
                        setMenu(null);
                        if (confirm("确认删除对话？"))
                          action(() =>
                            json(
                              `/snap/api/chats/${chat.id}`,
                              { apiVersion: 1, version: chat.version },
                              "DELETE",
                            ),
                          );
                      }}
                    >
                      <Icon name="trash" size={16} />删除对话
                    </button>
                  </menu>
                )}
              </li>
            ))}
          </ul>
        </details>
        {loading && <p className="history-loading" role="status">正在读取对话…</p>}
        {!loading && !chats.length && (
          <div className="history-empty">
            <Icon name={archived ? "archive" : "search"} size={24} />
            <p className="muted">{archived && !search ? "还没有归档对话" : "还没有匹配的对话"}</p>
          </div>
        )}
        {cursor && (
          <button className="load-more" onClick={() => void load(true)}>
            加载更多
          </button>
        )}
        {rename && (
          <form
            className="dialog nested-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="重命名对话"
            onSubmit={(event) => {
              event.preventDefault();
              action(() => patch(rename, { title }));
              setRename(null);
            }}
          >
            <span className="section-kicker">编辑信息</span>
            <h3>重命名对话</h3>
            <input
              aria-label="对话标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
            <footer>
              <button type="button" onClick={() => setRename(null)}>
                取消
              </button>
              <button className="primary-button" type="submit">保存标题</button>
            </footer>
          </form>
        )}
        {share && (
          <section
            className="dialog nested-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="分享对话"
          >
            <span className="section-kicker">局域网分享</span>
            <h3>分享对话</h3>
            <p>同一局域网中，已配对的设备可打开这个对话。</p>
            <input
              aria-label="对话链接"
              readOnly
              value={location.origin + "/c/" + share.id}
            />
            <footer>
              <button onClick={() => setShare(null)}>关闭</button>
              <button
                className="primary-button"
                onClick={() =>
                  void copy(location.origin + "/c/" + share.id).catch(() =>
                    setError("复制失败，请长按选择链接复制"),
                  )
                }
              >
                复制链接
              </button>
            </footer>
          </section>
        )}
      </aside>
    </div>
  );
}
