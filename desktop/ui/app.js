const $ = (id) => document.getElementById(id);
let state,
  busy = false;
function notice(text, error = false, source = "action") {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
  $("notice").dataset.source = source;
}
function render(next) {
  state = next;
  if (next.capture) renderCapture(next.capture);
  const online = next.ready && !next.paused && !next.error && next.networks.length > 0;
  $("service-status").textContent = next.error
    ? "启动失败"
    : next.paused
      ? "手机访问已暂停"
      : !next.networks.length
        ? "电脑未联网"
        : next.ready
          ? "可以连接手机"
          : "正在启动";
  $("service-status").className =
    "pill " + (next.error ? "error" : online ? "ready" : "");
  $("qr").src = next.qr;
  $("qr-cover").hidden = online;
  $("qr-cover").textContent = next.error
    ? "启动失败"
    : next.paused
      ? "恢复访问后可扫码"
      : !next.networks.length
        ? "请先连接 Wi-Fi 或有线网络"
        : "正在启动…";
  $("code").textContent = next.code.slice(0, 3) + " " + next.code.slice(3);
  $("address").textContent = next.baseUrl;
  $("expiry").textContent =
    Math.max(1, Math.ceil((next.expiresAt - Date.now()) / 60000)) +
    " 分钟内有效";
  const networkKey = JSON.stringify(next.networks);
  if ($("networks").dataset.key !== networkKey) {
    $("networks").replaceChildren(
      ...next.networks.map((item) => {
        const option = document.createElement("option");
        option.value = item.address;
        option.textContent = item.name + " · " + item.address;
        return option;
      }),
    );
    $("networks").dataset.key = networkKey;
  }
  $("networks").value = next.selectedAddress;
  const granted = next.permission === "granted";
  $("permission-icon").textContent = granted ? "✓" : "!";
  $("permission-icon").classList.toggle("ready", granted);
  $("permission-title").textContent = granted ? "已允许截屏" : "截屏未授权";
  $("permission-hint").textContent = granted
    ? ""
    : "在系统设置中允许 Electron 录屏，然后重启。";
  $("permission").hidden = granted || next.platform !== "darwin";
  $("pause").textContent = next.paused ? "恢复手机访问" : "暂停手机访问";
  $("background-note").textContent = next.backgroundAvailable === false
    ? "关闭窗口将退出 App"
    : "关闭窗口后继续运行";
  $("device-count").textContent = next.devices.length + " 台";
  $("preview").disabled = !online;
  const devices = next.devices.map((device) => {
    const minutes = Math.floor((Date.now() - device.lastSeen) / 60000);
    const activity = next.paused
      ? "访问已暂停"
      : minutes < 1
        ? "刚刚访问"
        : minutes < 60
          ? minutes + " 分钟前访问"
          : minutes < 1440
            ? Math.floor(minutes / 60) + " 小时前访问"
            : Math.floor(minutes / 1440) + " 天前访问";
    return { ...device, activity };
  });
  if ($("devices").dataset.key !== JSON.stringify(devices)) {
    $("devices").replaceChildren();
    if (!next.devices.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "等待手机连接";
      $("devices").append(p);
    }
    for (const device of devices) {
      const row = document.createElement("div");
      row.className = "device";
      const icon = document.createElement("span");
      icon.className = "device-icon";
      icon.innerHTML =
        '<svg viewBox="0 0 20 28"><rect x="3" y="1" width="14" height="26" rx="3"/><path d="M8 4h4m-3 19h2"/></svg>';
      const label = document.createElement("div");
      label.className = "device-label";
      const name = document.createElement("span");
      name.textContent = device.name;
      const status = document.createElement("small");
      status.textContent = device.activity;
      const remove = document.createElement("button");
      remove.className = "text-button";
      remove.textContent = "取消配对";
      remove.onclick = () => action(async () => {
        const result = await window.snap.revoke(device.id);
        notice("已取消配对。这台设备需重新扫码连接。");
        return result;
      });
      label.append(name, status);
      row.append(icon, label, remove);
      $("devices").append(row);
    }
    $("devices").dataset.key = JSON.stringify(devices);
  }
  if (next.error) notice(next.error, true, "system");
  else if (!next.networks.length)
    notice("请先连接 Wi-Fi 或有线网络。", true, "system");
  else if ($("notice").dataset.source === "system") notice("");
}
async function action(fn) {
  if (busy) return;
  busy = true;
  try {
    const result = await fn();
    if (result?.networks) render(result);
  } catch (error) {
    notice(
      error.message.replace(/^Error invoking remote method .*?: /, ""),
      true,
    );
  } finally {
    busy = false;
  }
}
$("copy").onclick = () =>
  action(async () => {
    await window.snap.copyAddress();
    notice("连接地址已复制。手机浏览器打开后，输入连接码即可。");
  });
$("refresh-code").onclick = () => action(async () => {
  const result = await window.snap.refreshCode();
  notice("连接码已更新，已配对设备不受影响。");
  return result;
});
$("networks").onchange = () =>
  action(() => window.snap.selectNetwork($("networks").value));
$("pause").onclick = () => action(() => window.snap.pause(!state.paused));
$("permission").onclick = () => action(() => window.snap.permission());
$("test").onclick = () =>
  desktopCapture(async () => {
    $("test").disabled = true;
    try {
      await window.snap.testCapture();
    } finally {
      $("test").disabled = false;
      $("test").textContent = "检查截屏";
    }
  });
$("preview").onclick = () => action(() => window.snap.openPhonePreview());
$("quit").onclick = () => window.snap.quit();
let settingsSignature;
function renderCapture(next) {
  const serviceReady = state?.ready && !state.paused && !state.error && state.permission === "granted";
  $("capture-send").disabled = !serviceReady || !next.receiver.ready || next.busy;
  $("capture-region").disabled = !serviceReady || !next.receiver.ready || next.busy || !next.mouseSupported;
  $("capture-cancel").hidden = true;
  $("full-shortcut").textContent = next.settings.fullShortcut;
  $("region-shortcut").textContent = next.settings.regionShortcut;
  $("capture-target").hidden = true;
  $("capture-notice").hidden = true;
  $("capture-notice").textContent = "";
  const signature = JSON.stringify(next.settings);
  if (settingsSignature !== signature) {
    fillCaptureSettings(next.settings);
    settingsSignature = signature;
  }
  $("setting-mouse-enabled").disabled = !next.mouseSupported;
  const mouseSelected = next.settings.mouseEnabled || next.settings.doubleClickEnabled;
  $("mouse-input-status").textContent = state?.platform === "darwin"
    ? mouseSelected ? next.mouseReady ? "鼠标监听已就绪" : "鼠标监听未就绪，请在系统设置中允许输入监控，然后重新保存设置。"
      : "macOS 鼠标操作需要输入监控权限；启用后会由系统请求授权。"
    : "";
  $("mouse-permission").hidden = state?.platform !== "darwin" || !mouseSelected || next.mouseReady;
}
function fillCaptureSettings(settings) {
  for (const [id, key] of [["full", "fullShortcut"], ["region", "regionShortcut"], ["cancel", "cancelShortcut"], ["mouse-button", "mouseButton"], ["prompt", "prompt"]])
    $("setting-" + id).value = settings[key];
  for (const [id, key] of [["hold", "holdMs"], ["timeout", "timeoutMs"], ["double-time", "doubleClickMs"]])
    $("setting-" + id).value = settings[key] / 1000;
  $("setting-mouse-enabled").checked = settings.mouseEnabled;
  $("setting-double-enabled").checked = settings.doubleClickEnabled;
}
for (const input of document.querySelectorAll(".shortcut-input")) {
  input.onfocus = () => window.snap.suspendCaptureShortcuts(true);
  input.onblur = () => window.snap.suspendCaptureShortcuts(false);
  input.onkeydown = (event) => {
    event.preventDefault();
    if (["Control", "Shift", "Alt", "Meta", "Tab"].includes(event.key)) {
      if (event.key === "Tab") input.blur();
      return;
    }
    const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3)
      : /^Digit[0-9]$/.test(event.code) ? event.code.slice(5)
        : event.key === " " ? "Space" : event.key;
    input.value = [event.ctrlKey && "Ctrl", event.metaKey && "Super", event.altKey && "Alt", event.shiftKey && "Shift", key].filter(Boolean).join("+");
  };
}
$("capture-settings-form").onsubmit = (event) => {
  event.preventDefault();
  action(async () => {
    const result = await window.snap.saveCaptureSettings({
      fullShortcut: $("setting-full").value, regionShortcut: $("setting-region").value,
      cancelShortcut: $("setting-cancel").value, mouseEnabled: $("setting-mouse-enabled").checked,
      mouseButton: $("setting-mouse-button").value, doubleClickEnabled: $("setting-double-enabled").checked,
      holdMs: Math.round(Number($("setting-hold").value) * 1000),
      timeoutMs: Math.round(Number($("setting-timeout").value) * 1000),
      doubleClickMs: Math.round(Number($("setting-double-time").value) * 1000), prompt: $("setting-prompt").value,
    });
    renderCapture(result);
    notice("");
  });
};
async function desktopCapture(action) {
  try { await action(); } catch { /* Capture failures stay in the operation log. */ }
  finally { refresh(); }
}
$("capture-send").onclick = () => desktopCapture(() => window.snap.captureAndSend());
$("capture-region").onclick = () => desktopCapture(() => window.snap.selectRegion());
$("mouse-permission").onclick = () => action(() => window.snap.openMousePermission());
$("capture-cancel").onclick = () => window.snap.cancelRegion();
window.snap.onCaptureState(renderCapture);
let logEntries = [], clearingCache = false;
function formatBytes(bytes) {
  return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + " MB"
    : bytes >= 1024 ? (bytes / 1024).toFixed(1) + " KB" : bytes + " B";
}
function renderLogs() {
  const entries = logEntries.filter((entry) => $("log-level").value !== "errors" || entry.level !== "info");
  $("activity-log").replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = $("log-level").value === "errors" ? "暂无异常记录" : "暂无操作记录";
    $("activity-log").append(empty);
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "log-entry";
    row.dataset.level = entry.level;
    const heading = document.createElement("div");
    heading.className = "log-heading";
    const time = document.createElement("time");
    time.dateTime = entry.at;
    time.textContent = new Date(entry.at).toLocaleString("zh-CN", { hour12: false });
    const message = document.createElement("strong");
    message.textContent = entry.message;
    heading.append(time, message);
    row.append(heading);
    const details = [];
    const metadata = entry.metadata;
    if (metadata.origin) details.push({ desktop: "电脑操作", phone: "手机操作", check: "截屏检查" }[metadata.origin]);
    if (metadata.mode) details.push(metadata.mode === "region" ? "区域截图" : "全屏截图");
    if (metadata.width && metadata.height) details.push(metadata.width + " × " + metadata.height);
    if (metadata.bytes !== undefined) details.push("释放 " + formatBytes(metadata.bytes));
    if (entry.reason) details.push(entry.reason);
    if (details.length) {
      const detail = document.createElement("small");
      detail.textContent = details.join(" · ");
      row.append(detail);
    }
    $("activity-log").append(row);
  }
}
async function loadMaintenance() {
  try {
    const [logs, cache] = await Promise.all([window.snap.activityLog(), window.snap.cacheInfo()]);
    logEntries = logs.entries;
    renderLogs();
    $("cache-size").textContent = "可重新生成的页面与代码缓存 · " + formatBytes(cache.bytes);
    if (logs.error) {
      $("maintenance-status").textContent = logs.error;
      $("maintenance-status").classList.add("error");
    }
  } catch {
    $("maintenance-status").textContent = "暂时无法读取日志或缓存，请稍后重试。";
    $("maintenance-status").classList.add("error");
  }
}
$("maintenance").ontoggle = () => { if ($("maintenance").open) loadMaintenance(); };
$("refresh-logs").onclick = loadMaintenance;
$("log-level").onchange = renderLogs;
$("clear-cache").onclick = async () => {
  if (clearingCache) return;
  clearingCache = true;
  $("clear-cache").disabled = true;
  $("clear-cache").textContent = "正在清理…";
  $("maintenance-status").textContent = "";
  $("maintenance-status").classList.remove("error");
  try {
    const result = await window.snap.clearCache();
    $("maintenance-status").textContent = "缓存已清理，释放 " + formatBytes(result.bytes) + "。聊天记录与设置已保留。";
  } catch {
    $("maintenance-status").textContent = "缓存未能全部清理，请稍后重试。聊天记录与设置已保留。";
    $("maintenance-status").classList.add("error");
  } finally {
    clearingCache = false;
    $("clear-cache").disabled = false;
    $("clear-cache").textContent = "清除缓存";
    await loadMaintenance();
  }
};
async function refresh() {
  try {
    render(await window.snap.state());
  } catch (error) {
    notice(error.message, true);
  }
}
refresh();
setInterval(refresh, 2500);

let providers = [], selectedProviderId = "", providerSaving = false, providerLoading = false, providerLoaded = false;
const providerMarks = { openai: "O", anthropic: "A", google: "G", alibaba: "千", doubao: "豆", moonshot: "K" };
function selectedProvider() { return providers.find(provider => provider.id === selectedProviderId); }
function renderProviders() {
  const list = $("providers");
  list.replaceChildren();
  for (const provider of providers) {
    const button = document.createElement("button"), mark = document.createElement("span"), copy = document.createElement("span");
    button.type = "button";
    button.className = "provider-option" + (provider.configured ? " configured" : "");
    button.dataset.id = provider.id;
    button.setAttribute("aria-current", String(provider.id === selectedProviderId));
    button.disabled = providerSaving;
    mark.className = "provider-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = providerMarks[provider.id] || provider.name.slice(0, 1);
    const name = document.createElement("strong"), status = document.createElement("small");
    name.textContent = provider.name;
    status.textContent = provider.configured ? "密钥已存" : "添加密钥";
    copy.append(name, status);
    button.append(mark, copy);
    button.onclick = () => chooseProvider(provider.id);
    list.append(button);
  }
}
function chooseProvider(id) {
  if (providerSaving) return;
  selectedProviderId = id;
  const provider = selectedProvider();
  renderProviders();
  $("provider-form").hidden = !provider;
  if (!provider) return;
  $("provider-name").textContent = provider.name;
  $("provider-state").textContent = provider.configured ? "密钥已存" : "";
  $("api-key").value = "";
  $("api-key").required = !provider.configured;
  $("api-key").placeholder = provider.configured ? "已保存 · 留空保留" : "粘贴你的 API Key";
  $("key-note").textContent = provider.configured ? "填写新密钥可替换已有密钥；留空则保留" : "密钥仅保存在这台电脑";
  $("base-url").value = provider.baseUrl;
  $("model-list").replaceChildren(...provider.models.map(model => {
    const line = document.createElement("div");
    line.textContent = model;
    return line;
  }));
  $("remove-provider").hidden = !provider.configured;
  $("provider-error").textContent = "";
}
async function loadProviders() {
  if (providerSaving || providerLoading) return;
  providerLoading = true;
  $("refresh-providers").disabled = true;
  try {
    const catalog = await window.snap.providers();
    providers = catalog.providers;
    providerLoaded = true;
    $("verified").textContent = "目录更新于 " + catalog.verifiedAt;
    $("providers-message").textContent = "";
    chooseProvider(providers.some(p => p.id === selectedProviderId) ? selectedProviderId : providers[0]?.id);
  } catch {
    $("providers-message").textContent = "暂时无法读取模型服务，请检查电脑服务后点击“重新读取”。";
  } finally {
    providerLoading = false;
    $("refresh-providers").disabled = false;
  }
}
async function saveProvider(remove = false) {
  if (providerSaving) return;
  const provider = selectedProvider();
  if (!provider) return;
  providerSaving = true;
  const key = $("api-key").value.trim();
  const change = {
    apiVersion: 1, providerId: provider.id, revision: provider.revision,
    baseUrl: $("base-url").value.trim(), apiType: provider.apiType,
    modelIds: provider.models, keyAction: remove ? "delete" : key ? "set" : "keep",
    ...(remove || !key ? {} : { apiKey: key }),
  };
  $("api-key").value = "";
  $("save-provider").disabled = true;
  $("remove-provider").disabled = true;
  $("save-provider").textContent = remove ? "正在移除…" : "正在保存…";
  $("provider-error").textContent = "";
  renderProviders();
  try {
    const catalog = await window.snap.saveProvider(change);
    providers = catalog.providers;
    $("verified").textContent = "目录更新于 " + catalog.verifiedAt;
    $("providers-message").textContent = remove ? "密钥已移除；聊天记录保留。" : "设置已保存；不会自动调用模型。";
    selectedProviderId = provider.id;
  } catch (error) {
    const message = String(error?.message || "");
    $("provider-error").textContent = message.includes("VERSION_CONFLICT")
      ? "设置已在别处更新，请点击“重新读取”查看最新状态。"
      : message.includes("INVALID_CONTRACT") ? "请检查 API 地址和密钥后重试。"
        : "保存结果未确认，请点击“重新读取”查看状态后再操作。";
  } finally {
    providerSaving = false;
    $("save-provider").disabled = false;
    $("remove-provider").disabled = false;
    $("save-provider").textContent = "保存设置";
    renderProviders();
    const current = selectedProvider();
    if (current) {
      $("provider-state").textContent = current.configured ? "密钥已存" : "";
      $("api-key").required = !current.configured;
      $("api-key").placeholder = current.configured ? "已保存 · 留空保留" : "粘贴你的 API Key";
      $("key-note").textContent = current.configured ? "填写新密钥可替换已有密钥；留空则保留" : "密钥仅保存在这台电脑";
      $("remove-provider").hidden = !current.configured;
    }
  }
}
$("provider-form").onsubmit = event => { event.preventDefault(); void saveProvider(); };
$("refresh-providers").onclick = () => { if (!providerSaving) void loadProviders(); };
$("remove-provider").onclick = () => {
  if (confirm("移除这家服务的密钥？聊天记录会保留。")) void saveProvider(true);
};

// Navigation only changes the visible workspace; every existing control keeps
// its original DOM node, draft values, event handler and IPC path.
const workspaceCopy = {
  overview: ["连接你的日常", "问题在电脑，答案在手边。", "连接手机，让每一个问题都有清晰的答案。"],
  models: ["模型服务", "连接你的 AI 搭档。", "在电脑上管理 API Key，手机只需选择模型并提问。"],
  capture: ["按你的习惯来", "让截图，成为提问的起点。", "设置顺手的快捷键与鼠标操作，用自己的方式开始对话。"],
  network: ["保持连接", "让手机，找到这台电脑。", "查看连接码与局域网地址，选择适合当前网络的连接方式。"],
  activity: ["运行记录", "每一次操作，都有迹可循。", "查看最近的操作与异常，按需管理临时缓存。"],
};
function showWorkspace(view) {
  if (!Object.hasOwn(workspaceCopy, view)) return;
  for (const button of document.querySelectorAll("[data-view]")) {
    if (button.dataset.view === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  for (const panel of document.querySelectorAll("[data-panel]")) {
    panel.hidden = panel.dataset.panel !== view;
    if (!panel.hidden && panel instanceof HTMLDetailsElement) {
      if (!panel.open) panel.open = true;
      else if (view === "activity") void loadMaintenance();
    }
  }
  const [kicker, title, description] = workspaceCopy[view];
  $("view-kicker").textContent = kicker;
  $("view-title").textContent = title;
  $("view-description").textContent = description;
  $("desktop-main").scrollTop = 0;
  if (view === "models" && !providerLoaded) void loadProviders();
}
for (const button of document.querySelectorAll("[data-view]"))
  button.addEventListener("click", () => showWorkspace(button.dataset.view));
document.querySelector("a.brand").addEventListener("click", (event) => {
  event.preventDefault();
  showWorkspace("overview");
});
