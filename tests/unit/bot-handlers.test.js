import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { registerBotHandlers } from "../../src/main/ipc/bot-handlers.js";

const BOT_ID = "123e4567-e89b-12d3-a456-426614174000";

function createHarness({ tracked = true } = {}) {
  const handlers = new Map();
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler)
  };
  const frame = {};
  const window = {
    webContents: {
      mainFrame: frame,
      send() {}
    },
    isDestroyed: () => false
  };
  const botStore = {
    list: async () => [],
    create: async () => ({}),
    update: async () => ({}),
    setEnabled: async () => ({}),
    remove: async () => ({})
  };
  const botManager = new EventEmitter();
  botManager.hasTrackedProcess = () => tracked;
  botManager.getStatus = () => ({ status: "stopped" });
  botManager.listStatuses = () => [];
  botManager.start = async () => ({});
  botManager.stop = async () => ({});
  botManager.restart = async () => ({});
  const processMonitor = new EventEmitter();
  processMonitor.getSnapshot = () => null;

  registerBotHandlers(ipcMain, () => window, botStore, botManager, processMonitor);
  const event = { sender: window.webContents, senderFrame: frame };
  return { handlers, event, botStore };
}

test("prevents editing, disabling, and removing a bot with a tracked child process", async () => {
  const { handlers, event } = createHarness({ tracked: true });

  await assert.rejects(
    handlers.get("bots:update")(event, BOT_ID, { name: "Changed name" }),
    /Stop this bot before editing/
  );
  await assert.rejects(
    handlers.get("bots:set-enabled")(event, BOT_ID, false),
    /Stop this bot before disabling/
  );
  await assert.rejects(
    handlers.get("bots:remove")(event, BOT_ID),
    /Stop this bot before removing/
  );
});

test("allows bot configuration changes when no child process is tracked", async () => {
  const { handlers, event, botStore } = createHarness({ tracked: false });
  let updateCalls = 0;
  let enableCalls = 0;
  let removeCalls = 0;
  botStore.update = async () => { updateCalls += 1; return {}; };
  botStore.setEnabled = async () => { enableCalls += 1; return {}; };
  botStore.remove = async () => { removeCalls += 1; return {}; };

  await handlers.get("bots:update")(event, BOT_ID, { name: "Changed name" });
  await handlers.get("bots:set-enabled")(event, BOT_ID, false);
  await handlers.get("bots:remove")(event, BOT_ID);

  assert.equal(updateCalls, 1);
  assert.equal(enableCalls, 1);
  assert.equal(removeCalls, 1);
});
