const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { runtimePaths } = require("./runtime-paths.cjs");

class MouseInput {
  constructor(onEvent, onError) {
    Object.assign(this, { onEvent, onError });
  }
  start(button) {
    this.stop();
    if (process.platform !== "win32") return;
    const { python, mouse } = runtimePaths();
    const child = spawn(python, ["-I", "-B", "-u", mouse,
      "--parent", String(process.pid), "--button", button], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdin.on("error", () => {});
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      if (this.child !== child) return;
      let event;
      try { event = JSON.parse(line); } catch { return; }
      try { this.onEvent(event); } catch { this.onError("鼠标操作未能完成，请重新开始选区"); }
    });
    child.stderr.resume();
    child.on("error", () => {
      if (this.child === child) this.onError("鼠标监听启动失败，请检查 Python 环境");
    });
    child.on("exit", () => {
      lines.close();
      if (this.child === child) {
        this.child = null;
        this.onError("鼠标监听已停止，请重新保存截图设置后重试");
      }
    });
  }
  stop() {
    const child = this.child;
    this.child = null;
    if (!child) return;
    // Closing stdin stops the real Python process as well as its venv launcher.
    child.stdin.end();
    const timer = setTimeout(() => { if (child.exitCode === null) child.kill(); }, 1500);
    timer.unref();
    child.once("exit", () => clearTimeout(timer));
  }
}

module.exports = { MouseInput };
