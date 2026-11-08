const path = require("node:path");
const labels = {
  inspected: "已确认旧数据",
  snapshotted: "旧数据副本已保存",
  files: "图片已核对",
  data: "聊天与设置已保留",
  validated: "正在核对迁移结果",
  activated: "已完成，即将打开",
};
async function migrationWindow(electron) {
  const window = new electron.BrowserWindow({
    width: 600,
    height: 390,
    resizable: false,
    show: false,
    title: "保留你的聊天 · Scrylet",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setAudioMuted(true);
  await window.loadFile(path.join(__dirname, "ui/migration.html"));
  window.show();
  return {
    window,
    update(value) {
      if (
        !Object.hasOwn(labels, value.stage) ||
        !Number.isInteger(value.completed) ||
        value.completed < 0 ||
        value.completed > 6 ||
        window.isDestroyed()
      )
        return;
      void window.webContents
        .executeJavaScript(
          `document.querySelector('progress').value=${value.completed};document.querySelector('#phase').textContent=${JSON.stringify(labels[value.stage])};`,
        )
        .catch(() => {});
    },
    close() {
      if (!window.isDestroyed()) window.destroy();
    },
  };
}
module.exports = { migrationWindow };
