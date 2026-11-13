import { EventEmitter } from "node:events";
import systemInformation from "systeminformation";

const DEFAULT_INTERVAL_MS = 3000;

function round(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : null;
}

export class ProcessMonitor extends EventEmitter {
  constructor(botManager, {
    provider = systemInformation,
    intervalMs = DEFAULT_INTERVAL_MS
  } = {}) {
    super();
    this.botManager = botManager;
    this.provider = provider;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.samplingGeneration = null;
    this.lastSnapshot = null;
    this.generation = 0;
  }

  start() {
    if (this.timer) return;
    this.generation += 1;
    this.timer = setInterval(() => void this.sample(), this.intervalMs);
    void this.sample();
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Ignore any provider result that arrives after monitoring has stopped.
    this.generation += 1;
  }

  getSnapshot() {
    return this.lastSnapshot;
  }

  async sample() {
    const generation = this.generation;
    if (this.samplingGeneration === generation) return this.lastSnapshot;
    this.samplingGeneration = generation;
    try {
      const active = this.botManager.listStatuses()
        .filter((item) => item.status === "running" && item.pid);
      const [load, memory, processData] = await Promise.all([
        this.provider.currentLoad(),
        this.provider.mem(),
        active.length ? this.provider.processes() : Promise.resolve({ list: [] })
      ]);

      const processByPid = new Map(
        (processData.list ?? []).map((item) => [Number(item.pid), item])
      );
      const bots = active.map((runtime) => {
        const process = processByPid.get(Number(runtime.pid));
        return {
          botId: runtime.botId,
          pid: runtime.pid,
          cpuPercent: round(process?.cpu),
          memoryPercent: round(process?.mem),
        };
      });

      const snapshot = {
        timestamp: new Date().toISOString(),
        system: {
          cpuPercent: round(load.currentLoad),
          memoryUsedBytes: Number(memory.used) || 0,
          memoryTotalBytes: Number(memory.total) || 0,
          memoryPercent: memory.total ? round((memory.used / memory.total) * 100) : null
        },
        bots
      };
      if (generation !== this.generation) return this.lastSnapshot;
      this.lastSnapshot = snapshot;
      this.emit("metrics", this.lastSnapshot);
      return this.lastSnapshot;
    } catch (error) {
      if (generation === this.generation) {
        this.emit("metrics-error", { message: error.message, timestamp: new Date().toISOString() });
      }
      return this.lastSnapshot;
    } finally {
      if (this.samplingGeneration === generation) this.samplingGeneration = null;
    }
  }
}
