const names = { left: "左键", right: "右键", middle: "中键", x1: "侧键 1", x2: "侧键 2" };
window.selection.onState((state) => {
  const first = state.first;
  document.getElementById("step").textContent = first ? "2" : "1";
  document.getElementById("title").textContent = state.phase === "release-first"
    ? "左上角已记录，请松开鼠标" : state.phase === "release"
      ? "右下角已记录，松开后发送" : first ? "选择右下角" : "选择左上角";
  const seconds = state.deadline ? Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)) : null;
  document.getElementById("hint").textContent = `按住鼠标${names[state.mouseButton]} ${state.holdMs / 1000} 秒` +
    (seconds !== null ? ` · ${seconds} 秒内开始下一次长按` : " · 截图后自动发送");
  document.getElementById("cancel").textContent = state.cancelShortcut + " 取消";
  const region = document.getElementById("region"), corner = document.getElementById("corner");
  region.hidden = corner.hidden = !first;
  if (!first) return;
  corner.style.left = first.x - state.bounds.x + "px";
  corner.style.top = first.y - state.bounds.y + "px";
  const second = state.second || state.cursor;
  region.style.left = Math.min(first.x, second.x) - state.bounds.x + "px";
  region.style.top = Math.min(first.y, second.y) - state.bounds.y + "px";
  region.style.width = Math.abs(second.x - first.x) + "px";
  region.style.height = Math.abs(second.y - first.y) + "px";
});
