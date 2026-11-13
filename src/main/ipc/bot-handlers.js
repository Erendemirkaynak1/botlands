import { validateBotId } from "../utils/bot-validation.js";

export function registerBotHandlers(ipcMain, getMainWindow, botStore, botManager, processMonitor) {
  const assertTrustedSender = (event) => {
    const window = getMainWindow();
    if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("Untrusted IPC sender.");
    }
  };

  const publishToRenderer = (channel, payload) => {
    const window = getMainWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  };

  botManager.on("status", (status) => publishToRenderer("bots:status", status));
  botManager.on("log", (entry) => publishToRenderer("bots:log", entry));
  processMonitor.on("metrics", (snapshot) => publishToRenderer("system:metrics", snapshot));

  ipcMain.handle("bots:list", async (event) => {
    assertTrustedSender(event);
    return botStore.list();
  });

  ipcMain.handle("bots:create", async (event, input) => {
    assertTrustedSender(event);
    return botStore.create(input);
  });

  ipcMain.handle("bots:update", async (event, id, input) => {
    assertTrustedSender(event);
    validateBotId(id);
    if (botManager.hasTrackedProcess(id)) {
      throw new Error("Stop this bot before editing its configuration.");
    }
    return botStore.update(id, input);
  });

  ipcMain.handle("bots:set-enabled", async (event, id, enabled) => {
    assertTrustedSender(event);
    validateBotId(id);
    if (enabled === false && botManager.hasTrackedProcess(id)) {
      throw new Error("Stop this bot before disabling it.");
    }
    return botStore.setEnabled(id, enabled);
  });

  ipcMain.handle("bots:remove", async (event, id) => {
    assertTrustedSender(event);
    validateBotId(id);
    if (botManager.hasTrackedProcess(id)) {
      throw new Error("Stop this bot before removing it.");
    }
    return botStore.remove(id);
  });

  ipcMain.handle("system:get-metrics", (event) => {
    assertTrustedSender(event);
    return processMonitor.getSnapshot();
  });

  ipcMain.handle("bots:get-statuses", (event) => {
    assertTrustedSender(event);
    return botManager.listStatuses();
  });

  ipcMain.handle("bots:start", async (event, id) => {
    assertTrustedSender(event);
    return botManager.start(validateBotId(id));
  });

  ipcMain.handle("bots:stop", async (event, id) => {
    assertTrustedSender(event);
    return botManager.stop(validateBotId(id));
  });

  ipcMain.handle("bots:restart", async (event, id) => {
    assertTrustedSender(event);
    return botManager.restart(validateBotId(id));
  });
}
