import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
let mainWindow;

function registerIpcHandlers() {
  ipcMain.handle("app:get-info", (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      throw new Error("Untrusted IPC sender.");
    }

    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      electronVersion: process.versions.electron
    };
  });
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
      preload: join(currentDir, "../preload/index.js"),
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
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
