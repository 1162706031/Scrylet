const crypto = require("node:crypto");

const reasons = {
  hidden: "请保持手机聊天页面在前台",
  loading: "请在手机打开聊天页面并连接模型",
  draft: "手机有未发送的草稿，已保留；请先发送或清空",
  generating: "手机正在生成回答，请稍后再截屏",
  busy: "手机正在处理图片，请稍候",
};

// A single-use command mailbox. Chats, messages and generation belong to Open WebUI.
class CaptureDelivery {
  constructor(now = Date.now) {
    this.now = now;
    this.receivers = new Map();
    this.selected = null;
    this.pending = null;
  }
  poll(device, data) {
    if (!data || !/^[a-zA-Z0-9_-]{16,80}$/.test(data.clientId) ||
        typeof data.context !== "string" || data.context.length > 400)
      throw new Error("接收页面标识无效");
    const previous = this.receivers.get(data.clientId);
    if (previous && previous.deviceId !== device.id)
      throw new Error("接收页面不属于这台设备");
    for (const [id, receiver] of this.receivers)
      if (this.now() - receiver.seen > 10000) this.receivers.delete(id);
    const receiver = {
      clientId: data.clientId,
      deviceId: device.id,
      name: device.name,
      context: data.context,
      seen: this.now(),
      ready: data.ready === true,
      active: data.active === true,
      reason: reasons[data.reason] || reasons.loading,
    };
    this.receivers.set(data.clientId, receiver);
    const selected = this.receivers.get(this.selected);
    if (!this.pending && receiver.active &&
        (!selected || !selected.active || this.now() - selected.seen > 4000 || data.claim === true))
      this.selected = receiver.clientId;
    const job = this.pending;
    if (job && job.receiver.clientId === receiver.clientId && !job.dispatched) {
      if (job.receiver.context !== receiver.context) {
        this.finish(job, new Error("手机对话已切换，请重新截屏"));
      } else if (!receiver.active || !receiver.ready) {
        this.finish(job, new Error(receiver.reason));
      } else {
        job.dispatched = true;
        return { command: { id: job.id, image: job.image, prompt: job.prompt, showCaptureHints: job.showCaptureHints } };
      }
    }
    return { command: null, deferClaim: Boolean(this.pending && data.claim && this.selected !== receiver.clientId) };
  }
  status() {
    const receiver = this.receivers.get(this.selected);
    const online = receiver && this.now() - receiver.seen <= 4000;
    return {
      connected: Boolean(online),
      ready: Boolean(online && receiver.active && receiver.ready && !this.pending),
      name: online ? receiver.name : "",
      reason: !online ? "请在手机保持聊天页面打开" : this.pending
        ? "正在发送截图…" : !receiver.active || !receiver.ready ? receiver.reason : "",
    };
  }
  target() {
    const status = this.status();
    if (!status.ready) throw new Error(status.reason);
    return this.receivers.get(this.selected);
  }
  send(receiver, capture, prompt) {
    if (this.pending) throw new Error("上一张截图正在发送，请稍候");
    const current = this.target();
    if (receiver.clientId !== current.clientId || receiver.context !== current.context)
      throw new Error("接收页面已切换，请重新截屏");
    return new Promise((resolve, reject) => {
      const job = {
        id: crypto.randomUUID(), receiver, image: capture.image, prompt,
        showCaptureHints: false,
        dispatched: false, resolve, reject,
      };
      this.pending = job;
      job.timer = setTimeout(() => this.finish(job, new Error(
        job.dispatched ? "未收到手机发送确认，请查看聊天记录后再重试" : "手机未接收截图，请保持聊天页面打开后重试",
      )), 25000);
    });
  }
  acknowledge(device, data) {
    const job = this.validate(device, data);
    this.finish(job, data.success === true ? null : new Error(
      typeof data.error === "string" ? data.error.slice(0, 240) : "手机未能发送截图",
    ));
  }
  validate(device, data) {
    const job = this.pending;
    if (!job || job.id !== data?.id || job.receiver.deviceId !== device.id ||
        job.receiver.clientId !== data.clientId || !job.dispatched)
      throw new Error("截图指令已失效");
    return job;
  }
  finish(job, error) {
    if (this.pending !== job) return;
    clearTimeout(job.timer);
    this.pending = null;
    job.image = null;
    if (error) job.reject(error);
    else job.resolve({ success: true, name: job.receiver.name });
  }
  revoke(deviceId) {
    for (const [id, receiver] of this.receivers)
      if (receiver.deviceId === deviceId) this.receivers.delete(id);
    if (this.pending?.receiver.deviceId === deviceId)
      this.finish(this.pending, new Error("接收设备已取消配对"));
  }
  cancel(message = "截图发送已取消") {
    if (this.pending) this.finish(this.pending, new Error(message));
  }
  close() {
    this.cancel();
    this.receivers.clear();
  }
}

module.exports = { CaptureDelivery };
