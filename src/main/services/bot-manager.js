import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { EventEmitter } from "node:events";
import treeKill from "tree-kill";
import { validateBotId } from "../utils/bot-validation.js";

const STOP_TIMEOUT_MS = 5000;
const FORCE_STOP_TIMEOUT_MS = 3000;
const LOG_LIMIT = 500;

function terminateTree(pid, signal) {
  return new Promise((resolve, reject) => {
    treeKill(pid, signal, (error) => {
      if (error && error.code !== "ESRCH") reject(error);
      else resolve();
    });
  });
}

export class BotManager extends EventEmitter {
  constructor(botStore, { spawnProcess = spawn, stopTimeoutMs = STOP_TIMEOUT_MS } = {}) {
    super();
    this.botStore = botStore;
    this.spawnProcess = spawnProcess;
    this.stopTimeoutMs = stopTimeoutMs;
    this.processes = new Map();
    this.queues = new Map();
  }

  serialize(id, operation) {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    this.queues.set(id, current);
    return current.finally(() => {
      if (this.queues.get(id) === current) this.queues.delete(id);
    });
  }

  snapshot(runtime) {
    return {
      botId: runtime.botId,
      status: runtime.status,
      pid: runtime.pid ?? null,
      startedAt: runtime.startedAt ?? null,
      exitCode: runtime.exitCode ?? null,
      signal: runtime.signal ?? null,
      error: runtime.error ?? null
    };
  }

  publishStatus(runtime) {
    this.emit("status", this.snapshot(runtime));
  }

  getStatus(botId) {
    validateBotId(botId);
    const runtime = this.processes.get(botId);
    return runtime ? this.snapshot(runtime) : {
      botId, status: "stopped", pid: null, startedAt: null,
      exitCode: null, signal: null, error: null
    };
  }

  listStatuses() {
    return [...this.processes.values()].map((runtime) => this.snapshot(runtime));
  }

  async start(botId) {
    validateBotId(botId);
    return this.serialize(botId, async () => {
      const bot = (await this.botStore.list()).find((item) => item.id === botId);
      if (!bot) throw new Error("Bot not found.");
      if (!bot.enabled) throw new Error("This bot is disabled. Enable it before starting.");

      const existing = this.processes.get(botId);
      if (existing && ["starting", "running", "stopping"].includes(existing.status)) {
        throw new Error(`Bot is already ${existing.status}.`);
      }

      const directory = await stat(bot.cwd).catch(() => null);
      if (!directory?.isDirectory()) {
        throw new Error("The configured working directory does not exist or is not a directory.");
      }

      const runtime = {
        botId,
        status: "starting",
        pid: null,
        startedAt: null,
        exitCode: null,
        signal: null,
        error: null,
        logLines: 0,
        child: null,
        closePromise: null,
        resolveClose: null
      };
      this.processes.set(botId, runtime);
      this.publishStatus(runtime);

      let child;
      try {
        child = this.spawnProcess(bot.executable, bot.args, {
          cwd: bot.cwd,
          env: { ...process.env },
          shell: false,
          windowsHide: true,
          detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe"]
        });
      } catch (error) {
        runtime.status = "errored";
        runtime.error = error.message;
        this.publishStatus(runtime);
        throw error;
      }

      runtime.child = child;
      runtime.pid = child.pid ?? null;
      runtime.closePromise = new Promise((resolve) => { runtime.resolveClose = resolve; });

      child.stdout?.on("data", (chunk) => this.publishLog(runtime, "stdout", chunk));
      child.stderr?.on("data", (chunk) => this.publishLog(runtime, "stderr", chunk));

      child.once("spawn", () => {
        runtime.status = "running";
        runtime.pid = child.pid ?? null;
        runtime.startedAt = new Date().toISOString();
        this.publishStatus(runtime);
      });

      child.once("error", (error) => {
        runtime.status = "errored";
        runtime.error = error.message;
        this.publishStatus(runtime);
        runtime.resolveClose?.();
      });

      child.once("close", (code, signal) => {
        runtime.exitCode = code;
        runtime.signal = signal;
        runtime.status = runtime.status === "errored" ? "errored" : "stopped";
        runtime.child = null;
        this.publishStatus(runtime);
        runtime.resolveClose?.();
      });

      await new Promise((resolve, reject) => {
        if (child.pid) resolve();
        else {
          child.once("spawn", resolve);
          child.once("error", reject);
        }
      });
      return this.snapshot(runtime);
    });
  }

  publishLog(runtime, stream, chunk) {
    const lines = String(chunk).split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      runtime.logLines += 1;
      this.emit("log", {
        botId: runtime.botId,
        stream,
        line: line.slice(0, 16_384),
        timestamp: new Date().toISOString(),
        sequence: runtime.logLines
      });
    }
    if (runtime.logLines > LOG_LIMIT) runtime.logLines = LOG_LIMIT;
  }

  async stop(botId) {
    validateBotId(botId);
    return this.serialize(botId, async () => {
      const runtime = this.processes.get(botId);
      if (!runtime || !runtime.child || !["starting", "running"].includes(runtime.status)) {
        return this.getStatus(botId);
      }

      const child = runtime.child;
      runtime.status = "stopping";
      this.publishStatus(runtime);
      if (child.pid) {
        await terminateTree(child.pid, "SIGTERM").catch((error) => {
          if (error.code !== "ESRCH") throw error;
        });
      } else {
        child.kill("SIGTERM");
      }

      const exited = await Promise.race([
        runtime.closePromise.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), this.stopTimeoutMs))
      ]);

      if (!exited && child.pid) {
        await terminateTree(child.pid, "SIGKILL").catch((error) => {
          if (error.code !== "ESRCH") throw error;
        });
        await Promise.race([
          runtime.closePromise,
          new Promise((resolve) => setTimeout(resolve, FORCE_STOP_TIMEOUT_MS))
        ]);
      }
      return this.getStatus(botId);
    });
  }

  async restart(botId) {
    validateBotId(botId);
    return this.serialize(botId, async () => {
      const runtime = this.processes.get(botId);
      if (runtime?.child && ["starting", "running", "stopping"].includes(runtime.status)) {
        await this.stopUnlocked(runtime);
      }
      return this.startUnlocked(botId);
    });
  }

  async stopUnlocked(runtime) {
    const child = runtime.child;
    if (!child) return;
    runtime.status = "stopping";
    this.publishStatus(runtime);
    if (child.pid) await terminateTree(child.pid, "SIGTERM");
    const exited = await Promise.race([
      runtime.closePromise.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), this.stopTimeoutMs))
    ]);
    if (!exited && child.pid) {
      await terminateTree(child.pid, "SIGKILL");
      await Promise.race([runtime.closePromise, new Promise((resolve) => setTimeout(resolve, FORCE_STOP_TIMEOUT_MS))]);
    }
  }

  async startUnlocked(botId) {
    const bot = (await this.botStore.list()).find((item) => item.id === botId);
    if (!bot) throw new Error("Bot not found.");
    if (!bot.enabled) throw new Error("This bot is disabled. Enable it before starting.");
    const directory = await stat(bot.cwd).catch(() => null);
    if (!directory?.isDirectory()) throw new Error("The configured working directory does not exist or is not a directory.");
    const runtime = {
      botId, status: "starting", pid: null, startedAt: null, exitCode: null,
      signal: null, error: null, logLines: 0, child: null, closePromise: null, resolveClose: null
    };
    this.processes.set(botId, runtime);
    this.publishStatus(runtime);
    const child = this.spawnProcess(bot.executable, bot.args, {
      cwd: bot.cwd, env: { ...process.env }, shell: false, windowsHide: true,
      detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"]
    });
    runtime.child = child;
    runtime.pid = child.pid ?? null;
    runtime.closePromise = new Promise((resolve) => { runtime.resolveClose = resolve; });
    child.stdout?.on("data", (chunk) => this.publishLog(runtime, "stdout", chunk));
    child.stderr?.on("data", (chunk) => this.publishLog(runtime, "stderr", chunk));
    child.once("spawn", () => {
      runtime.status = "running"; runtime.pid = child.pid ?? null;
      runtime.startedAt = new Date().toISOString(); this.publishStatus(runtime);
    });
    child.once("error", (error) => {
      runtime.status = "errored"; runtime.error = error.message; this.publishStatus(runtime); runtime.resolveClose?.();
    });
    child.once("close", (code, signal) => {
      runtime.exitCode = code; runtime.signal = signal;
      runtime.status = runtime.status === "errored" ? "errored" : "stopped";
      runtime.child = null; this.publishStatus(runtime); runtime.resolveClose?.();
    });
    await new Promise((resolve, reject) => {
      if (child.pid) resolve();
      else { child.once("spawn", resolve); child.once("error", reject); }
    });
    return this.snapshot(runtime);
  }

  async stopAll() {
    const activeIds = [...this.processes.values()]
      .filter((runtime) => runtime.child && ["starting", "running", "stopping"].includes(runtime.status))
      .map((runtime) => runtime.botId);
    await Promise.allSettled(activeIds.map((id) => this.stop(id)));
  }
}
