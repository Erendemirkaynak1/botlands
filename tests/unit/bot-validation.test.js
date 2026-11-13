import test from "node:test";
import assert from "node:assert/strict";
import { validateBotId, validateBotInput } from "../../src/main/utils/bot-validation.js";

test("accepts a valid bot configuration", () => {
  const bot = validateBotInput({
    name: "Worker",
    cwd: "/home/user/worker",
    executable: "node",
    args: ["index.js"]
  });
  assert.deepEqual(bot, {
    name: "Worker",
    cwd: "/home/user/worker",
    executable: "node",
    args: ["index.js"]
  });
});

test("rejects empty required fields", () => {
  assert.throws(() => validateBotInput({
    name: " ",
    cwd: "/tmp",
    executable: "node",
    args: []
  }), /name is required/);
});

test("rejects unexpected properties", () => {
  assert.throws(() => validateBotInput({
    name: "Worker",
    cwd: "/tmp",
    executable: "node",
    args: [],
    shell: true
  }), /Unsupported bot field/);
});

test("validates IDs before store access", () => {
  assert.throws(() => validateBotId("../bots"), /valid bot ID/);
  assert.equal(validateBotId("123e4567-e89b-12d3-a456-426614174000"), "123e4567-e89b-12d3-a456-426614174000");
});

test("preserves intentional whitespace inside command arguments", () => {
  const bot = validateBotInput({
    name: "Worker",
    cwd: "/tmp",
    executable: "node",
    args: ["  value with spaces  ", ""]
  });
  assert.deepEqual(bot.args, ["  value with spaces  ", ""]);
});

test("supports partial updates without dropping omitted fields", () => {
  assert.deepEqual(validateBotInput({ enabled: false }, { partial: true }), { enabled: false });
});
