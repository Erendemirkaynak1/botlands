const NAME_MAX_LENGTH = 80;
const PATH_MAX_LENGTH = 2048;
const ARG_MAX_LENGTH = 2048;
const MAX_ARGS = 100;

function requireString(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

export function validateBotInput(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Bot data must be an object.");
  }

  const allowedFields = new Set(["name", "cwd", "executable", "args", "enabled"]);
  for (const key of Object.keys(input)) {
    if (!allowedFields.has(key)) throw new Error(`Unsupported bot field: ${key}`);
  }

  const output = {};
  const fields = ["name", "cwd", "executable"];
  for (const field of fields) {
    if (partial && !(field in input)) continue;
    const limit = field === "name" ? NAME_MAX_LENGTH : PATH_MAX_LENGTH;
    output[field] = requireString(input[field], field, limit);
  }

  if (!partial || "args" in input) {
    if (!Array.isArray(input.args) || input.args.length > MAX_ARGS) {
      throw new Error(`args must be an array with at most ${MAX_ARGS} entries.`);
    }
    output.args = input.args.map((arg, index) => {
      if (typeof arg !== "string" || arg.length > ARG_MAX_LENGTH) {
        throw new Error(`Argument ${index + 1} is invalid.`);
      }
      return arg;
    });
  }

  if ("enabled" in input) {
    if (typeof input.enabled !== "boolean") throw new Error("enabled must be a boolean.");
    output.enabled = input.enabled;
  }

  return output;
}

export function validateBotId(id) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("A valid bot ID is required.");
  }
  return id;
}
