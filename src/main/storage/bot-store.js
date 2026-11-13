import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateBotId, validateBotInput } from "../utils/bot-validation.js";

const STORE_VERSION = 1;
const MAX_STORE_BYTES = 5 * 1024 * 1024;
const MAX_BOTS = 500;

export class BotStore {
  constructor(userDataPath) {
    this.directory = userDataPath;
    this.filePath = join(userDataPath, "bots.json");
    this.queue = Promise.resolve();
  }

  runExclusive(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async readData() {
    try {
      const fileStats = await stat(this.filePath);
      if (fileStats.size > MAX_STORE_BYTES) {
        throw new Error("Bot configuration file exceeds the maximum supported size.");
      }
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw);
      if (data.version !== STORE_VERSION || !Array.isArray(data.bots)) {
        throw new Error("Bot configuration file has an unsupported format.");
      }
      if (data.bots.length > MAX_BOTS) {
        throw new Error("Bot configuration file contains too many bot records.");
      }
      const seenIds = new Set();
      const bots = data.bots.map((bot) => {
        if (!bot || typeof bot !== "object" || Array.isArray(bot)) {
          throw new Error("Bot configuration file contains an invalid record.");
        }
        validateBotId(bot.id);
        if (seenIds.has(bot.id)) {
          throw new Error("Bot configuration file contains duplicate bot IDs.");
        }
        seenIds.add(bot.id);
        if (typeof bot.enabled !== "boolean") {
          throw new Error("Bot configuration file contains an invalid enabled flag.");
        }
        const validated = validateBotInput({
          name: bot.name,
          cwd: bot.cwd,
          executable: bot.executable,
          args: bot.args,
          enabled: bot.enabled
        });
        if (!Number.isFinite(Date.parse(bot.createdAt)) || !Number.isFinite(Date.parse(bot.updatedAt))) {
          throw new Error("Bot configuration file contains invalid timestamps.");
        }
        return {
          id: bot.id,
          ...validated,
          createdAt: bot.createdAt,
          updatedAt: bot.updatedAt
        };
      });
      return { version: STORE_VERSION, bots };
    } catch (error) {
      if (error.code === "ENOENT") return { version: STORE_VERSION, bots: [] };
      throw error;
    }
  }

  async writeData(data) {
    await mkdir(this.directory, { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx"
      });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }

  list() {
    return this.runExclusive(async () => {
      const { bots } = await this.readData();
      return bots;
    });
  }

  create(input) {
    return this.runExclusive(async () => {
      const bot = {
        id: randomUUID(),
        ...validateBotInput(input),
        enabled: input.enabled ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const data = await this.readData();
      data.bots.push(bot);
      await this.writeData(data);
      return bot;
    });
  }

  update(id, input) {
    return this.runExclusive(async () => {
      const botId = validateBotId(id);
      const changes = validateBotInput(input, { partial: true });
      const data = await this.readData();
      const index = data.bots.findIndex((bot) => bot.id === botId);
      if (index === -1) throw new Error("Bot not found.");
      data.bots[index] = {
        ...data.bots[index],
        ...changes,
        updatedAt: new Date().toISOString()
      };
      await this.writeData(data);
      return data.bots[index];
    });
  }

  setEnabled(id, enabled) {
    if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean.");
    return this.update(id, { enabled });
  }

  remove(id) {
    return this.runExclusive(async () => {
      const botId = validateBotId(id);
      const data = await this.readData();
      const index = data.bots.findIndex((bot) => bot.id === botId);
      if (index === -1) throw new Error("Bot not found.");
      const [removed] = data.bots.splice(index, 1);
      await this.writeData(data);
      return removed;
    });
  }
}
