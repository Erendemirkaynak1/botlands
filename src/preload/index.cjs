const { contextBridge, ipcRenderer } = require("electron");

const botlandsApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => ipcRenderer.invoke("app:get-info")
  }),
  system: Object.freeze({
    getMetrics: () => ipcRenderer.invoke("system:get-metrics"),
    onMetrics: (callback) => {
      if (typeof callback !== "function") throw new TypeError("callback must be a function");
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("system:metrics", listener);
      return () => ipcRenderer.removeListener("system:metrics", listener);
    }
  }),
  bots: Object.freeze({
    list: () => ipcRenderer.invoke("bots:list"),
    create: (input) => ipcRenderer.invoke("bots:create", input),
    update: (id, input) => ipcRenderer.invoke("bots:update", id, input),
    setEnabled: (id, enabled) => ipcRenderer.invoke("bots:set-enabled", id, enabled),
    remove: (id) => ipcRenderer.invoke("bots:remove", id),
    getStatuses: () => ipcRenderer.invoke("bots:get-statuses"),
    start: (id) => ipcRenderer.invoke("bots:start", id),
    stop: (id) => ipcRenderer.invoke("bots:stop", id),
    restart: (id) => ipcRenderer.invoke("bots:restart", id),
    onStatus: (callback) => {
      if (typeof callback !== "function") throw new TypeError("callback must be a function");
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("bots:status", listener);
      return () => ipcRenderer.removeListener("bots:status", listener);
    },
    onLog: (callback) => {
      if (typeof callback !== "function") throw new TypeError("callback must be a function");
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("bots:log", listener);
      return () => ipcRenderer.removeListener("bots:log", listener);
    }
  })
});

contextBridge.exposeInMainWorld("botlands", botlandsApi);
