import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BotStore } from "./storage/bot-store.js";
import { registerBotHandlers } from "./ipc/bot-handlers.js";
import { BotManager } from "./services/bot-manager.js";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
let mainWindow;

function registerIpcHandlers(botStore, botManager) {
  ipcMain.handle("app:get-info", (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("Untrusted IPC sender.");
    }

    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      electronVersion: process.versions.electron
    };
  });

  registerBotHandlers(ipcMain, () => mainWindow, botStore, botManager);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b1020",
    title: "Botlands",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(currentDir, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const localUrl = mainWindow?.webContents.getURL();
    if (url !== localUrl) event.preventDefault();
  });

  void mainWindow.loadFile(join(currentDir, "../renderer/index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const botStore = new BotStore(app.getPath("userData"));
  const botManager = new BotManager(botStore);
  registerIpcHandlers(botStore, botManager);

  let isQuitting = false;
  app.on("before-quit", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    void botManager.stopAll().finally(() => app.quit());
  });
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
