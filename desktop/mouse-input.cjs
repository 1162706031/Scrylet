const { spawn } = require("node:child_process");
const { runtimePaths } = require("./runtime-paths.cjs");
const { observerProgram } = require("./native-program.cjs");
const { parseNativeLine } = require("../contracts/validate.cjs");

class MouseInput {
  constructor(onEvent, onError, options = {}) {
    Object.assign(this, { onEvent, onError, options });
    this.intent = 0;
    this.closing = Promise.resolve();
  }
  start(button) {
    const stopped = this.stop(),
      intent = this.intent;
    this.starting = stopped
      .then(() => {
        if (
          intent !== this.intent ||
          (this.options.platform || process.platform) !== "win32" ||
          (this.options.arch || process.arch) !== "x64"
        )
          return;
        if (!["left", "right", "middle", "x1", "x2"].includes(button))
          throw Error("NATIVE_BUTTON");
        const program = this.options.program
          ? this.options.program()
          : observerProgram(runtimePaths());
        if (!program) throw Error("NATIVE_UNSUPPORTED");
        const child = (this.options.spawn || spawn)(
          program,
          ["--parent", String(process.pid), "--button", button],
          { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
        );
        this.child = child;
        let ready = false,
          buffer = "",
          failed = false;
        const fail = (message) => {
          if (failed || this.child !== child) return;
          failed = true;
          this.onError(message);
          void this.stop();
        };
        const timeout = setTimeout(
          () => fail("原生鼠标监听握手超时，请检查预编译程序"),
          this.options.handshakeTimeout || 2500,
        );
        child.stdin.on("error", () => {});
        child.stderr.resume();
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (data) => {
          if (this.child !== child) return;
          buffer += data;
          for (;;) {
            const end = buffer.indexOf("\n");
            if (end < 0) {
              if (Buffer.byteLength(buffer) > 1024)
                fail("原生鼠标监听协议不兼容，请重新安装");
              break;
            }
            const line = buffer.slice(0, end + 1);
            buffer = buffer.slice(end + 1);
            try {
              const event = parseNativeLine(line);
              if (event.type === "ready") {
                if (ready) throw Error();
                ready = true;
                clearTimeout(timeout);
              } else if (!ready) throw Error();
              this.onEvent(event);
            } catch {
              fail("原生鼠标监听协议不兼容，请重新安装");
              break;
            }
          }
        });
        child.stdout.once("end", () => {
          if (buffer) fail("原生鼠标监听事件被截断，请重试");
        });
        child.once("error", () =>
          fail("原生鼠标监听启动失败，请检查预编译程序"),
        );
        child.once("exit", () => {
          clearTimeout(timeout);
          if (this.child === child) {
            this.child = null;
            this.onError("原生鼠标监听已停止，请重新保存截图设置后重试");
          }
        });
      })
      .catch(() => {
        if (intent === this.intent)
          this.onError(
            "原生鼠标监听程序缺失、损坏或架构不匹配；请构建或重新安装",
          );
      });
    return this.starting;
  }
  stop() {
    this.intent++;
    const child = this.child;
    this.child = null;
    if (!child) return this.closing;
    this.closing = new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(kill);
        clearTimeout(bound);
        resolve();
      };
      const kill = setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, this.options.stopTimeout || 1000);
      const bound = setTimeout(done, (this.options.stopTimeout || 1000) + 1000);
      child.once("exit", done);
      child.once("error", done);
      child.stdin.end();
    });
    return this.closing;
  }
}
module.exports = { MouseInput };
