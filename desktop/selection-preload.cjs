const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("selection", {
  onState: (callback) => ipcRenderer.on("snap:selection-state", (_event, state) => callback(state)),
});
