import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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

test("rejects duplicate IDs and invalid enabled flags in persisted data", async () => {
  await withStore(async (store) => {
    const created = await store.create(sampleBot);
    const raw = await readFile(store.filePath, "utf8");
    const data = JSON.parse(raw);
    data.bots.push({ ...data.bots[0] });
    await writeFile(store.filePath, JSON.stringify(data));
    await assert.rejects(store.list(), /duplicate bot IDs/);

    data.bots = [{ ...created, enabled: "yes" }];
    await writeFile(store.filePath, JSON.stringify(data));
    await assert.rejects(store.list(), /invalid enabled flag/);
  });
});

test("rejects oversized writes without replacing the existing store", async () => {
  await withStore(async (store) => {
    const created = await store.create(sampleBot);
    const oversizedBot = {
      ...created,
      args: ["x".repeat(2048)].concat(
        Array.from({ length: 2600 }, () => "y".repeat(2048))
      )
    };

    await assert.rejects(
      store.writeData({ version: 1, bots: [oversizedBot] }),
      /maximum supported size/
    );

    const bots = await store.list();
    assert.equal(bots.length, 1);
    assert.equal(bots[0].id, created.id);
  });
});

test("rejects oversized persisted configuration files", async () => {
  await withStore(async (store) => {
    await writeFile(store.filePath, "x".repeat(5 * 1024 * 1024 + 1));
    await assert.rejects(store.list(), /maximum supported size/);
  });
});


test("rejects malformed records and invalid persisted timestamps", async () => {
  await withStore(async (store) => {
    const created = await store.create(sampleBot);
    const raw = await readFile(store.filePath, "utf8");
    const data = JSON.parse(raw);

    data.bots = [null];
    await writeFile(store.filePath, JSON.stringify(data));
    await assert.rejects(store.list(), /invalid record/);

    data.bots = [{ ...created, createdAt: "not-a-date" }];
    await writeFile(store.filePath, JSON.stringify(data));
    await assert.rejects(store.list(), /invalid timestamps/);

    data.bots = [{ ...created, updatedAt: null }];
    await writeFile(store.filePath, JSON.stringify(data));
    await assert.rejects(store.list(), /invalid timestamps/);
  });
});

test("enforces the maximum number of bots before creating another record", async () => {
  await withStore(async (store) => {
    const created = await store.create(sampleBot);
    const timestamp = new Date().toISOString();
    const bots = Array.from({ length: 500 }, (_, index) => ({
      ...created,
      id: randomUUID(),
      name: `Worker ${index}`,
      createdAt: timestamp,
      updatedAt: timestamp
    }));
    await writeFile(store.filePath, JSON.stringify({ version: 1, bots }));

    await assert.rejects(
      store.create(sampleBot),
      /at most 500 bots/
    );
    assert.equal((await store.list()).length, 500);
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


test("rejects invalid top-level JSON shapes and unsupported store versions", async () => {
  await withStore(async (store) => {
    for (const invalid of [null, [], "invalid", { version: 2, bots: [] }, { version: 1, bots: {} }]) {
      await writeFile(store.filePath, JSON.stringify(invalid));
      await assert.rejects(store.list(), /unsupported format/);
    }
  });
});

test("requires persisted timestamps to be strings", async () => {
  await withStore(async (store) => {
    const created = await store.create(sampleBot);
    const data = JSON.parse(await readFile(store.filePath, "utf8"));

    data.bots[0].createdAt = 0;
    await writeFile(store.filePath, JSON.stringify(data));
    await assert.rejects(store.list(), /invalid timestamps/);

    data.bots[0] = { ...created, updatedAt: 123456789 };
    await writeFile(store.filePath, JSON.stringify(data));
    await assert.rejects(store.list(), /invalid timestamps/);
  });
});
