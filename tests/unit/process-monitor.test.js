import test from "node:test";
import assert from "node:assert/strict";
import { ProcessMonitor } from "../../src/main/services/process-monitor.js";

test("publishes system and per-bot metrics", async () => {
  const manager = {
    listStatuses: () => [
      { botId: "bot-1", status: "running", pid: 123 },
      { botId: "bot-2", status: "stopped", pid: null }
    ]
  };
  const provider = {
    currentLoad: async () => ({ currentLoad: 23.46 }),
    mem: async () => ({ used: 400, total: 1000 }),
    processes: async () => ({
      list: [{ pid: 123, cpu: 12.34, mem: 1.25 }]
    })
  };
  const monitor = new ProcessMonitor(manager, { provider });
  const snapshot = await monitor.sample();

  assert.equal(snapshot.system.cpuPercent, 23.5);
  assert.equal(snapshot.system.memoryPercent, 40);
  assert.equal(snapshot.bots.length, 1);
  assert.equal(snapshot.bots[0].botId, "bot-1");
  assert.equal(snapshot.bots[0].cpuPercent, 12.3);
  assert.equal(snapshot.bots[0].memoryPercent, 1.3);
});

test("does not request a process list when no bots are running", async () => {
  let processCalls = 0;
  const monitor = new ProcessMonitor(
    { listStatuses: () => [] },
    {
      provider: {
        currentLoad: async () => ({ currentLoad: 0 }),
        mem: async () => ({ used: 10, total: 100 }),
        processes: async () => { processCalls += 1; return { list: [] }; }
      }
    }
  );
  const snapshot = await monitor.sample();
  assert.equal(processCalls, 0);
  assert.deepEqual(snapshot.bots, []);
});

test("emits an error event instead of crashing when metrics are unavailable", async () => {
  const monitor = new ProcessMonitor(
    { listStatuses: () => [] },
    {
      provider: {
        currentLoad: async () => { throw new Error("metrics unavailable"); },
        mem: async () => ({ used: 0, total: 0 }),
        processes: async () => ({ list: [] })
      }
    }
  );
  let error;
  monitor.on("metrics-error", (payload) => { error = payload; });
  const snapshot = await monitor.sample();
  assert.equal(snapshot, null);
  assert.match(error.message, /metrics unavailable/);
});


test("ignores an in-flight metrics result after monitoring stops", async () => {
  let resolveLoad;
  let resolveMemory;
  const provider = {
    currentLoad: () => new Promise((resolve) => { resolveLoad = resolve; }),
    mem: () => new Promise((resolve) => { resolveMemory = resolve; }),
    processes: async () => ({ list: [] })
  };
  const monitor = new ProcessMonitor({ listStatuses: () => [] }, { provider, intervalMs: 60_000 });
  let metricsEvents = 0;
  let errorEvents = 0;
  monitor.on("metrics", () => { metricsEvents += 1; });
  monitor.on("metrics-error", () => { errorEvents += 1; });

  monitor.start();
  await new Promise((resolve) => setImmediate(resolve));
  monitor.stop();
  resolveLoad({ currentLoad: 12 });
  resolveMemory({ used: 20, total: 100 });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(metricsEvents, 0);
  assert.equal(errorEvents, 0);
  assert.equal(monitor.getSnapshot(), null);
});
