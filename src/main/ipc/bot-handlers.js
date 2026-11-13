import { validateBotId } from "../utils/bot-validation.js";

export function registerBotHandlers(ipcMain, getMainWindow, botStore) {
  const assertTrustedSender = (event) => {
    const window = getMainWindow();
    if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("Untrusted IPC sender.");
    }
  };

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
    return botStore.update(id, input);
  });

  ipcMain.handle("bots:set-enabled", async (event, id, enabled) => {
    assertTrustedSender(event);
    validateBotId(id);
    return botStore.setEnabled(id, enabled);
  });

  ipcMain.handle("bots:remove", async (event, id) => {
    assertTrustedSender(event);
    validateBotId(id);
    return botStore.remove(id);
  });
}
