import React, { useEffect, useRef, useState } from "react";
import type { PublicModel, PublicStatus } from "../../contracts/index.js";
import { id, json, messageOf, read, schemas } from "./api";
import { ConversationView } from "./chat/ConversationView";
import { HistoryPanel } from "./chat/HistoryPanel";
import { useDialogFocus } from "./dialogs";
import { Icon } from "./Icon";
type Route = { id: string | null; visit: string };
const currentChatId = (): string | null =>
  /^\/c\/([A-Za-z0-9_-]+)$/.exec(location.pathname)?.[1] || null;
const currentRoute = (): Route => ({
  id: currentChatId(),
  visit: id(),
});
export function App({
  migrationNotice = "",
}: {
  migrationNotice?: string;
}): React.JSX.Element {
  useDialogFocus();
  const [route, setRoute] = useState<Route>(currentRoute),
    [status, setStatus] = useState<PublicStatus | null>(null),
    [models, setModels] = useState<PublicModel[]>([]),
    [error, setError] = useState(""),
    [historyOpen, showHistory] = useState(false),
    [historyVersion, refreshHistory] = useState(0);
  const pageClientId = useRef(id()).current;
  const navigate = (chatId: string | null): void => {
    history.pushState(null, "", chatId ? "/c/" + chatId : "/");
    setRoute({ id: chatId, visit: id() });
    showHistory(false);
  };
  useEffect(() => {
    let active = true;
    const poll = async (): Promise<void> => {
      try {
        const next = await read("status", "/snap/api/status");
        if (!active) return;
        setStatus(next);
        setError("");
        if (next.ready && !next.paused) {
          const value = await json("/snap/api/models");
          if (!Array.isArray(value)) throw new Error("MODELS_INVALID");
          const parsed = value.map((m) => schemas.publicModel.parse(m));
          if (active)
            setModels((old) =>
              JSON.stringify(old) === JSON.stringify(parsed) ? old : parsed,
            );
        }
      } catch (cause) {
        if (active) setError(messageOf(cause));
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1500),
      pop = (): void => setRoute(currentRoute());
    addEventListener("popstate", pop);
    return () => {
      active = false;
      clearInterval(timer);
      removeEventListener("popstate", pop);
    };
  }, []);
  return (
    <div className="phone-app">
      <header className="app-header">
        <button
          className="icon-button header-action"
          aria-label="打开历史对话"
          onClick={() => showHistory(true)}
        >
          <Icon name="menu" size={22} />
        </button>
        <a
          className="brand"
          href="/"
          aria-label="Scrylet 首页"
          onClick={(e) => {
            e.preventDefault();
            navigate(null);
          }}
        >
          <span className="brand-mark"><Icon name="spark" size={17} /></span>
          <span className="brand-name">Scrylet</span>
        </a>
        <button
          className="icon-button header-action new-chat-action"
          aria-label="新对话"
          onClick={() => navigate(null)}
        >
          <Icon name="edit" size={20} />
        </button>
      </header>
      {migrationNotice && (
        <p className="inline-status" role="status">
          {migrationNotice}
        </p>
      )}
      {models.length ? (
        <ConversationView
          key={route.visit}
          routeId={route.id}
          models={models}
          status={status}
          statusError={error}
          clientId={pageClientId}
          changed={() => refreshHistory((n) => n + 1)}
          navigate={navigate}
        />
      ) : (
        <main className="initial">
          <span className="empty-icon"><Icon name="spark" size={34} /></span>
          <h1>从一个问题开始</h1>
          <p role="status">{error || "正在连接电脑…"}</p>
          <p>请在电脑 App 的“模型服务”中添加 API Key。</p>
          <a
            href={
              "/snap/pair?returnTo=" + encodeURIComponent(location.pathname)
            }
          >
            重新配对
          </a>
        </main>
      )}
      {historyOpen && (
        <HistoryPanel
          version={historyVersion}
          currentId={currentChatId()}
          onClose={() => showHistory(false)}
          navigate={navigate}
        />
      )}
    </div>
  );
}
