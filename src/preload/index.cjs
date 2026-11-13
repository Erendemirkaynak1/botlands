const { contextBridge, ipcRenderer } = require("electron");

const botlandsApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => ipcRenderer.invoke("app:get-info")
  }),
  bots: Object.freeze({
    list: () => ipcRenderer.invoke("bots:list"),
    create: (input) => ipcRenderer.invoke("bots:create", input),
    update: (id, input) => ipcRenderer.invoke("bots:update", id, input),
    setEnabled: (id, enabled) => ipcRenderer.invoke("bots:set-enabled", id, enabled),
    remove: (id) => ipcRenderer.invoke("bots:remove", id)
  })
});

contextBridge.exposeInMainWorld("botlands", botlandsApi);
