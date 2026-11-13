import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BotStore } from "./storage/bot-store.js";
import { registerBotHandlers } from "./ipc/bot-handlers.js";
import { BotManager } from "./services/bot-manager.js";
import { ProcessMonitor } from "./services/process-monitor.js";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
let mainWindow;

function registerIpcHandlers(botStore, botManager, processMonitor) {
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

  registerBotHandlers(ipcMain, () => mainWindow, botStore, botManager, processMonitor);
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
  const processMonitor = new ProcessMonitor(botManager);
  registerIpcHandlers(botStore, botManager, processMonitor);
  processMonitor.start();

  let isQuitting = false;
  let shutdownInProgress = false;

  async function attemptShutdown() {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    processMonitor.stop();

    try {
      await botManager.stopAll();
      isQuitting = true;
      app.quit();
    } catch (error) {
      const failures = error instanceof AggregateError
        ? error.errors.map((item) => item.message)
        : [error.message];
      const detail = [
        "Some bot processes may still be running:",
        ...failures.map((message) => `• ${message}`)
      ].join("\\n");

      try {
        const { response } = await dialog.showMessageBox(mainWindow ?? undefined, {
          type: "warning",
          title: "Botlands could not stop every bot",
          message: "One or more bot processes did not shut down cleanly.",
          detail,
          buttons: ["Retry stopping bots", "Quit anyway", "Keep Botlands open"],
          defaultId: 0,
          cancelId: 2,
          noLink: true
        });

        if (response === 0) {
          shutdownInProgress = false;
          void attemptShutdown();
          return;
        }

        if (response === 1) {
          isQuitting = true;
          app.quit();
          return;
        }
      } catch (dialogError) {
        console.error("Could not display the shutdown warning:", dialogError);
      }

      isQuitting = false;
      shutdownInProgress = false;
      processMonitor.start();
      if (!mainWindow) createMainWindow();
    }
  }

  app.on("before-quit", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    void attemptShutdown();
  });
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
