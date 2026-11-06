// Desktop actions use the same upstream composer and submit button as touch input.
export function receiveDesktop({ composer, api, available, changed, beforeSend }) {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const clientId = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  let polling = false, claim = true, processing = false, lastCommand;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const reason = composer.desktopReadiness() || (available() ? "" : "loading");
      const current = composer.context();
      const result = await api("/snap/api/desktop/poll", {
        clientId, claim, active: !document.hidden, ready: !reason && !processing, reason,
        context: current.path + ":" + current.epoch,
      }, { keepalive: true });
      claim = result.deferClaim === true;
      const command = result.command;
      if (!command || command.id === lastCommand) return;
      lastCommand = command.id;
      processing = true;
      const context = current;
      let success = false, error = "";
      try {
        composer.assertCurrent(context);
        if (composer.desktopReadiness() || !available()) throw new Error("手机聊天框状态已变化，请重新截屏");
        composer.busy = true;
        composer.silentFeedback = true;
        changed();
        if (typeof command.prompt !== "string" || !command.prompt.trim() ||
            typeof command.image !== "string" || !command.image.startsWith("data:image/"))
          throw new Error("截图指令无效");
        // Match manual capture: rasterize before using the native image paste path.
        const image = new Image();
        image.src = command.image;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d").drawImage(image, 0, 0);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.93));
        if (!blob) throw new Error("截图处理失败，请重新截屏");
        beforeSend();
        await composer.submitDesktop(blob, command.prompt, context, () =>
          api("/snap/api/desktop/validate", { clientId, id: command.id }));
        success = true;
      } catch (failure) {
        error = failure.message || "电脑截图发送失败";
      } finally {
        composer.busy = false;
        processing = false;
        composer.silentFeedback = false;
        changed();
      }
      // Never retry a submitted command if the receipt is lost.
      await api("/snap/api/desktop/ack", { clientId, id: command.id, success, error });
    } catch {
      // Pairing, pause and disconnection continue to use the visible heartbeat UI.
    } finally {
      polling = false;
    }
  }
  window.addEventListener("focus", () => { claim = true; poll(); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) claim = true;
    poll();
  });
  poll();
  setInterval(poll, 1000);
}
