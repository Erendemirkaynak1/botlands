import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BotStore } from "../../src/main/storage/bot-store.js";

async function withStore(callback) {
  const directory = await mkdtemp(join(tmpdir(), "botlands-test-"));
  try {
    await callback(new BotStore(directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const sampleBot = {
  name: "Example worker",
  cwd: "/tmp/example-worker",
  executable: "node",
  args: ["index.js"]
};

test("persists created bot configurations", async () => {
  await withStore(async (store) => {
    const created = await store.create(sampleBot);
    const reloaded = new BotStore(store.directory);
    const bots = await reloaded.list();
    assert.equal(bots.length, 1);
    assert.equal(bots[0].id, created.id);
    assert.equal(bots[0].name, sampleBot.name);
  });
});

test("updates, disables and removes a bot", async () => {
  await withStore(async (store) => {
    const created = await store.create(sampleBot);
    const updated = await store.update(created.id, { name: "Updated worker" });
    assert.equal(updated.name, "Updated worker");

    const disabled = await store.setEnabled(created.id, false);
    assert.equal(disabled.enabled, false);

    const removed = await store.remove(created.id);
    assert.equal(removed.id, created.id);
    assert.deepEqual(await store.list(), []);
  });
});

test("serializes concurrent writes without losing bot records", async () => {
  await withStore(async (store) => {
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        store.create({ ...sampleBot, name: `Worker ${index}` })
      )
    );
    assert.equal((await store.list()).length, 8);
  });
});
