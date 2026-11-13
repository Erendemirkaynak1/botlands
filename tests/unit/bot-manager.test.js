import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BotStore } from "../../src/main/storage/bot-store.js";
import { BotManager } from "../../src/main/services/bot-manager.js";

async function setup(t, args) {
  const directory = await mkdtemp(join(tmpdir(), "botlands-manager-"));
  const store = new BotStore(directory);
  const bot = await store.create({
    name: "Test process",
    cwd: directory,
    executable: process.execPath,
    args
  });
  const manager = new BotManager(store, { stopTimeoutMs: 1500 });
  t.after(async () => {
    await manager.stopAll();
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, bot, manager };
}

function waitForStatus(manager, botId, expected, timeoutMs = 5000) {
  const current = manager.getStatus(botId);
  if (current.status === expected) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      manager.removeListener("status", listener);
      reject(new Error(`Timed out waiting for bot status: ${expected}`));
    }, timeoutMs);
    const listener = (status) => {
      if (status.botId !== botId || status.status !== expected) return;
      clearTimeout(timeout);
      manager.removeListener("status", listener);
      resolve(status);
    };
    manager.on("status", listener);
  });
}

test("starts a process and streams stdout and stderr", async (t) => {
  const { bot, manager } = await setup(t, [
    "-e",
    "console.log('botlands-output'); console.error('botlands-error');"
  ]);
  const entries = [];
  manager.on("log", (entry) => entries.push(entry));

  await manager.start(bot.id);
  await waitForStatus(manager, bot.id, "stopped");

  assert.ok(entries.some((entry) => entry.stream === "stdout" && entry.line === "botlands-output"));
  assert.ok(entries.some((entry) => entry.stream === "stderr" && entry.line === "botlands-error"));
  assert.equal(manager.getStatus(bot.id).exitCode, 0);
});

test("stops a long-running process", async (t) => {
  const { bot, manager } = await setup(t, ["-e", "setInterval(() => {}, 1000)"]);
  await manager.start(bot.id);
  assert.equal(manager.getStatus(bot.id).status, "running");

  const result = await manager.stop(bot.id);
  assert.equal(result.status, "stopped");
  assert.equal(result.pid, null);
});

test("does not start disabled bots", async (t) => {
  const { bot, manager } = await setup(t, ["-e", "setInterval(() => {}, 1000)"]);
  await manager.botStore.setEnabled(bot.id, false);
  await assert.rejects(manager.start(bot.id), /disabled/);
  assert.equal(manager.getStatus(bot.id).status, "stopped");
});

test("rejects missing working directories before spawning", async (t) => {
  const { bot, manager } = await setup(t, ["-e", "process.exit(0)"]);
  await manager.botStore.update(bot.id, { cwd: join(tmpdir(), "botlands-path-that-does-not-exist") });
  await assert.rejects(manager.start(bot.id), /working directory/);
});

test("serializes concurrent start requests for the same bot", async (t) => {
  const { bot, manager } = await setup(t, ["-e", "setInterval(() => {}, 1000)"]);
  const results = await Promise.allSettled([
    manager.start(bot.id),
    manager.start(bot.id)
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(manager.getStatus(bot.id).status, "running");
});

test("restarts a running process", async (t) => {
  const { bot, manager } = await setup(t, ["-e", "setInterval(() => {}, 1000)"]);
  const first = await manager.start(bot.id);
  const restarted = await manager.restart(bot.id);
  assert.equal(restarted.status, "running");
  assert.ok(restarted.startedAt);
  assert.ok(first.pid);
  assert.ok(restarted.pid);
});

test("reports executable launch failures", async (t) => {
  const { bot, manager } = await setup(t, ["-e", "process.exit(0)"]);
  await manager.botStore.update(bot.id, { executable: "botlands-command-that-does-not-exist" });
  await assert.rejects(manager.start(bot.id));
  assert.equal(manager.getStatus(bot.id).status, "errored");
});


test("reports bot shutdown failures instead of silently ignoring them", async (t) => {
  const { bot, manager } = await setup(t, ["-e", "setInterval(() => {}, 1000)"]);
  manager.processes.set(bot.id, {
    botId: bot.id,
    status: "running",
    child: { pid: 12345 }
  });
  manager.stop = async () => {
    throw new Error("forced shutdown timed out");
  };

  await assert.rejects(manager.stopAll(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /1 bot process/);
    assert.match(error.errors[0].message, new RegExp(bot.id));
    assert.match(error.errors[0].message, /forced shutdown timed out/);
    return true;
  });
});
