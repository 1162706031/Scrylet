/* Versioned DOM adapter for the unmodified Open WebUI 0.12.2 composer.
 * Read and mutate its real attachment list; never keep a second chat draft. */
export class Composer {
  constructor(say, changed) {
    this.say = say;
    this.changed = changed;
    this.busy = false;
    this.epoch = 0;
    this.maxImages = 12;
    this.nativeClick = false;
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target.closest?.("button,a");
        if (
          target?.matches(
            "#new-chat-button,#sidebar-new-chat-button,a[href='/']",
          )
        ) {
          this.epoch++;
          this.changed();
        }
        if (this.busy && !this.desktopSubmit && target?.matches("#send-message-button")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!this.silentFeedback) this.say("图片正在加入，稍等一下");
        }
      },
      true,
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          this.busy &&
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.isComposing &&
          event.target.closest?.("#chat-input")
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    window.addEventListener("popstate", () => {
      this.epoch++;
      this.changed();
    });
  }
  container() {
    return document.querySelector("#message-input-container");
  }
  entries() {
    return [
      ...(this.container()?.querySelectorAll(
        'button[aria-label="移除文件"],button[aria-label="Remove file"]',
      ) || []),
    ].flatMap((remove) => {
      const row = remove.closest(".group");
      const image = row?.querySelector("img");
      const preview = image?.closest("button");
      return preview && image.getAttribute("src")
        ? [{ key: image.src, image, row, remove, preview }]
        : [];
    });
  }
  context() {
    return {
      editor: document.querySelector("#chat-input"),
      container: this.container(),
      path: location.pathname,
      epoch: this.epoch,
    };
  }
  isCurrent(context) {
    return (
      context?.editor &&
      context.editor === document.querySelector("#chat-input") &&
      context.container === this.container() &&
      context.path === location.pathname &&
      context.epoch === this.epoch
    );
  }
  assertCurrent(context) {
    if (!this.isCurrent(context))
      throw new Error("对话已切换，请在当前对话重新添加图片");
  }
  async run(action, { silent = false } = {}) {
    if (this.busy) return;
    this.busy = true;
    this.silentFeedback = silent;
    this.changed();
    try {
      return await action();
    } catch (error) {
      if (!silent) this.say(error.message || "图片操作失败，请重试", true);
    } finally {
      this.busy = false;
      this.silentFeedback = false;
      this.changed();
    }
  }
  async append(blob, context, name = "Scrylet-" + Date.now() + ".jpg", { showFeedback = true } = {}) {
    this.assertCurrent(context);
    const before = new Set(this.entries().map((entry) => entry.key));
    if (before.size >= this.maxImages)
      throw new Error(
        "每次最多添加 " + this.maxImages + " 张图片，请先发送或移除一些",
      );
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([blob], name, { type: blob.type || "image/jpeg" }),
    );
    context.editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      this.assertCurrent(context);
      const entry = this.entries().find((item) => !before.has(item.key));
      if (entry) {
        if (showFeedback) {
          entry.row.classList.add("snap-just-added");
          entry.row.scrollIntoView({ block: "nearest", inline: "nearest" });
          setTimeout(() => entry.row.classList.remove("snap-just-added"), 800);
        }
        return entry;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("图片尚未加入，请查看附件并确认模型支持图片，再重试");
  }
  remove(key, context) {
    this.assertCurrent(context);
    const entry = this.entries().find((item) => item.key === key);
    if (!entry) throw new Error("这张图片已不在当前草稿中");
    this.nativeClick = true;
    try {
      entry.remove.click();
    } finally {
      this.nativeClick = false;
    }
  }
  async blob(entry) {
    const url = new URL(entry.key, location.href);
    if (
      !["data:", "blob:"].includes(url.protocol) &&
      url.origin !== location.origin
    )
      throw new Error("无法恢复这张外部图片");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      ...(url.origin === location.origin
        ? {
            headers: {
              Authorization: "Bearer " + localStorage.getItem("token"),
            },
          }
        : {}),
    });
    if (!response.ok) throw new Error("图片读取失败，原图已保留");
    return response.blob();
  }
  desktopReadiness() {
    if (document.hidden) return "hidden";
    if (!this.context().editor) return "loading";
    if (this.generating()) return "generating";
    if (this.busy) return "busy";
    if (this.entries().length || this.context().editor.textContent.trim()) return "draft";
    return "";
  }
  generating() {
    return Boolean(this.container()?.querySelector('button[aria-label="停止"],button[aria-label="Stop"]'));
  }
  async submitDesktop(blob, prompt, context, validate) {
    // The caller owns this.busy until the upstream form accepts the send.
    this.assertCurrent(context);
    await this.append(blob, context, undefined, { showFeedback: false });
    this.assertCurrent(context);
    if (document.hidden) throw new Error("手机聊天页面已切到后台，截图保留在草稿中");
    if (context.editor.textContent.trim()) throw new Error("手机草稿已变化，截图保留在草稿中");
    const transfer = new DataTransfer();
    transfer.setData("text/plain", prompt);
    context.editor.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true, cancelable: true, clipboardData: transfer,
    }));
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      this.assertCurrent(context);
      const send = document.querySelector("#send-message-button");
      if (context.editor.textContent.trim() && send && !send.disabled) {
        await validate();
        this.assertCurrent(context);
        if (document.hidden) throw new Error("手机聊天页面已切到后台，截图保留在草稿中");
        this.desktopSubmit = true;
        try { send.click(); } finally { this.desktopSubmit = false; }
        // Observe the original composer clearing, not an independent chat state.
        while (Date.now() < deadline) {
          if (!this.entries().length && !document.querySelector("#chat-input")?.textContent.trim()) return;
          if (this.generating()) return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error("未确认聊天框提交，请查看手机记录后再重试");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("聊天框尚未就绪，截图保留在草稿中");
  }
}
