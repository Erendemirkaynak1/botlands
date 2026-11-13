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
    this.sampling = false;
    this.lastSnapshot = null;
  }

  start() {
    if (this.timer) return;
    void this.sample();
    this.timer = setInterval(() => void this.sample(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getSnapshot() {
    return this.lastSnapshot;
  }

  async sample() {
    if (this.sampling) return this.lastSnapshot;
    this.sampling = true;
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
          memoryRssMb: round(process?.memRss)
        };
      });

      this.lastSnapshot = {
        timestamp: new Date().toISOString(),
        system: {
          cpuPercent: round(load.currentLoad),
          memoryUsedBytes: Number(memory.used) || 0,
          memoryTotalBytes: Number(memory.total) || 0,
          memoryPercent: memory.total ? round((memory.used / memory.total) * 100) : null
        },
        bots
      };
      this.emit("metrics", this.lastSnapshot);
      return this.lastSnapshot;
    } catch (error) {
      this.emit("metrics-error", { message: error.message, timestamp: new Date().toISOString() });
      return this.lastSnapshot;
    } finally {
      this.sampling = false;
    }
  }
}
