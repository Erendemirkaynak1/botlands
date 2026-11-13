const { contextBridge, ipcRenderer } = require("electron");

const botlandsApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => ipcRenderer.invoke("app:get-info")
  })
});

contextBridge.exposeInMainWorld("botlands", botlandsApi);
