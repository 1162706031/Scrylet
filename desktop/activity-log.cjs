const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const EVENTS = {
  "app.started": ["info", "应用已启动"],
  "app.stopped": ["info", "应用已退出"],
  "runtime.ready": ["info", "聊天服务已就绪"],
  "runtime.failed": ["error", "聊天服务启动失败"],
  "device.paired": ["info", "手机已配对"],
  "device.revoked": ["info", "已撤销设备配对"],
  "access.paused": ["info", "手机访问已暂停"],
  "access.resumed": ["info", "手机访问已恢复"],
  "capture.started": ["info", "开始截图"],
  "capture.completed": ["info", "截图已完成"],
  "capture.sent": ["info", "截图与提示词已提交到手机聊天"],
  "capture.failed": ["error", "截图或发送未完成"],
  "capture.rejected": ["warn", "本次截图未执行"],
  "region.started": ["info", "开始选择截图区域"],
  "region.cancelled": ["info", "已取消截图选区"],
  "region.timeout": ["info", "选区等待超时，已恢复默认"],
  "settings.saved": ["info", "截图设置已保存"],
  "provider.saved": ["info", "模型连接设置已保存"],
  "chat.requested": ["info", "聊天请求已提交"],
  "chat.failed": ["error", "聊天请求返回错误"],
  "mouse.failed": ["error", "鼠标监听未能继续运行"],
  "cache.cleared": ["info", "页面与代码缓存已清理"],
  "cache.failed": ["error", "缓存未能全部清理"],
};
const REASONS = {
  permission: "屏幕权限不可用", draft: "手机有未发送草稿", generating: "手机正在生成回答",
  timeout: "等待超时", paused: "手机访问已暂停", unavailable: "接收页面或聊天服务不可用",
  changed: "对话或接收页面已变化", unknown: "请检查连接、屏幕状态及本地运行环境",
};
function reasonFor(error) {
  const text = String(error?.message || "");
  if (/权限|授权|permission/i.test(text)) return "permission";
  if (/草稿/.test(text)) return "draft";
  if (/生成回答/.test(text)) return "generating";
  if (/超时|timeout|确认/.test(text)) return "timeout";
  if (/暂停/.test(text)) return "paused";
  if (/切换|变化/.test(text)) return "changed";
  if (/连接|接收|启动|就绪/.test(text)) return "unavailable";
  return "unknown";
}
function safeMetadata(value = {}) {
  if (!value || typeof value !== "object") value = {};
  const result = {};
  for (const key of ["width", "height", "count", "bytes"]) {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0) result[key] = value[key];
  }
  if (["desktop", "phone", "check"].includes(value.origin)) result.origin = value.origin;
  if (["full", "region"].includes(value.mode)) result.mode = value.mode;
  if (Object.hasOwn(REASONS, value.reason)) result.reason = value.reason;
  return result;
}

// Fixed events and allowlisted metadata: never persist keys, prompts, URLs or images.
class ActivityLog {
  constructor(directory, { maxBytes = 1024 * 1024, archives = 3 } = {}) {
    this.directory = path.join(directory, "logs");
    this.file = path.join(this.directory, "activity.jsonl");
    this.maxBytes = maxBytes;
    this.archives = archives;
    this.error = "";
  }
  record(event, metadata = {}) {
    if (!Object.hasOwn(EVENTS, event)) return false;
    try {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      if (fs.existsSync(this.file) && fs.statSync(this.file).size >= this.maxBytes) {
        fs.rmSync(this.file + "." + this.archives, { force: true });
        for (let index = this.archives - 1; index >= 1; index--) {
          if (fs.existsSync(this.file + "." + index)) fs.renameSync(this.file + "." + index, this.file + "." + (index + 1));
        }
        fs.renameSync(this.file, this.file + ".1");
      }
      fs.appendFileSync(this.file, JSON.stringify({
        id: crypto.randomUUID(), at: new Date().toISOString(), event, metadata: safeMetadata(metadata),
      }) + "\n", { mode: 0o600 });
      this.error = "";
      return true;
    } catch {
      this.error = "操作日志暂时无法写入，请检查磁盘空间与目录权限。";
      return false;
    }
  }
  list() {
    const entries = [];
    try {
      for (let index = this.archives; index >= 0; index--) {
        const file = this.file + (index ? "." + index : "");
        if (!fs.existsSync(file)) continue;
        const stat = fs.statSync(file);
        // Do not read arbitrary oversized files placed in the journal directory.
        if (stat.size > this.maxBytes + 4096) continue;
        for (const line of fs.readFileSync(file, "utf8").split("\n")) {
          try {
            const value = JSON.parse(line);
            if (!Object.hasOwn(EVENTS, value.event) || typeof value.at !== "string" ||
                !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value.at) || !Number.isFinite(Date.parse(value.at))) continue;
            const [level, message] = EVENTS[value.event];
            const metadata = safeMetadata(value.metadata);
            entries.push({ at: value.at, event: value.event, level, message, metadata, reason: REASONS[metadata.reason] || "" });
          } catch { /* A partial final line must not prevent opening older records. */ }
        }
      }
      return { entries: entries.slice(-200).reverse(), error: this.error };
    } catch {
      return { entries: [], error: "操作日志暂时无法读取，请检查目录权限。" };
    }
  }
}

module.exports = { ActivityLog, reasonFor };
