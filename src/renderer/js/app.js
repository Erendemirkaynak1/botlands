const versionElement = document.querySelector("#app-version");
const platformElement = document.querySelector("#platform-label");
const botListElement = document.querySelector("#bot-list");
const emptyStateElement = document.querySelector("#empty-state");
const dialog = document.querySelector("#bot-dialog");
const form = document.querySelector("#bot-form");
const formError = document.querySelector("#form-error");
const saveButton = document.querySelector("#save-bot-button");
const noticeElement = document.querySelector("#app-notice");

const platformNames = { win32: "Windows", darwin: "macOS", linux: "Linux" };
const activeStates = new Set(["starting", "running", "stopping"]);
const statuses = new Map();
const logs = new Map();
const resourceMetrics = new Map();
let bots = [];
let editingBotId = null;
let noticeTimer;

function showNotice(message, isError = false) {
  noticeElement.textContent = message;
  noticeElement.classList.toggle("error", isError);
  noticeElement.hidden = !message;
  clearTimeout(noticeTimer);
  if (message) noticeTimer = setTimeout(() => { noticeElement.hidden = true; }, 5000);
}

function statusFor(botId) {
  return statuses.get(botId) ?? {
    botId, status: "stopped", pid: null, startedAt: null, exitCode: null, signal: null, error: null
  };
}

async function initializeDashboard() {
  window.botlands.bots.onStatus((status) => {
    statuses.set(status.botId, status);
    renderBots();
  });
  window.botlands.bots.onLog((entry) => appendLog(entry));
  window.botlands.system.onMetrics((snapshot) => applyMetrics(snapshot));

  try {
    const info = await window.botlands.app.getInfo();
    versionElement.textContent = `v${info.version}`;
    platformElement.textContent = platformNames[info.platform] ?? info.platform;
    document.title = `Botlands v${info.version}`;
    const [savedBots, currentStatuses] = await Promise.all([
      window.botlands.bots.list(),
      window.botlands.bots.getStatuses()
    ]);
    bots = savedBots;
    for (const status of currentStatuses) statuses.set(status.botId, status);
    renderBots();
    const metrics = await window.botlands.system.getMetrics();
    if (metrics) applyMetrics(metrics);
  } catch (error) {
    versionElement.textContent = "App info unavailable";
    showNotice(error.message || "Could not initialize the workspace.", true);
  }
}

async function refreshBots() {
  bots = await window.botlands.bots.list();
  renderBots();
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderBots() {
  botListElement.replaceChildren();
  emptyStateElement.hidden = bots.length > 0;

  const runningCount = bots.filter((bot) => statusFor(bot.id).status === "running").length;
  const enabledCount = bots.filter((bot) => bot.enabled).length;
  document.querySelector("#total-bots").textContent = String(bots.length);
  document.querySelector("#running-bots").textContent = String(runningCount);
  document.querySelector("#stopped-bots").textContent = String(enabledCount);
  document.querySelector("#list-count").textContent = `${bots.length} configured`;
  document.querySelector("#nav-bot-count").textContent = String(bots.length);

  for (const bot of bots) {
    const runtime = statusFor(bot.id);
    const card = createElement("article", "bot-card");
    card.dataset.botId = bot.id;

    const identity = createElement("div", "bot-identity");
    const icon = createElement("div", "bot-avatar", bot.name.slice(0, 1).toUpperCase());
    const details = createElement("div", "bot-details");
    details.append(
      createElement("h3", "", bot.name),
      createElement("p", "", `${bot.executable} · ${bot.args.length} argument(s)`)
    );
    identity.append(icon, details);

    const status = createElement(
      "span",
      `bot-status status-${runtime.status}`,
      bot.enabled ? runtime.status : "disabled"
    );

    const actions = createElement("div", "bot-actions");
    const busy = activeStates.has(runtime.status);
    actions.append(
      actionButton("Start", "start", bot.id, "success", !bot.enabled || busy),
      actionButton("Stop", "stop", bot.id, "subtle", !busy),
      actionButton("Restart", "restart", bot.id, "subtle", !bot.enabled || !busy),
      actionButton("Edit", "edit", bot.id, "subtle", busy),
      actionButton(bot.enabled ? "Disable" : "Enable", "toggle", bot.id, "subtle", busy),
      actionButton("Remove", "remove", bot.id, "danger", busy)
    );

    const meta = createElement("div", "bot-meta");
    meta.dataset.uptimeFor = bot.id;
    meta.textContent = formatBotMeta(runtime);

    const resource = createElement("div", "bot-resource", "Waiting for resource metrics…");
    resource.dataset.resourceFor = bot.id;
    const metric = resourceMetrics.get(bot.id);
    if (metric) resource.textContent = formatResourceMetric(metric);

    const outputDetails = createElement("details", "bot-logs");
    const summary = createElement("summary", "", "Live output");
    const output = createElement("pre", "bot-log-output");
    output.dataset.logOutput = bot.id;
    output.textContent = (logs.get(bot.id) ?? []).map(formatLog).join("\n");
    outputDetails.append(summary, output);

    card.append(identity, status, actions, meta, resource, outputDetails);
    botListElement.append(card);
  }
}

function formatBotMeta(runtime) {
  if (runtime.status === "starting") return "Starting process…";
  if (runtime.status === "stopping") return "Stopping process…";
  if (runtime.pid && runtime.startedAt) {
    return `PID ${runtime.pid} · Uptime ${formatDuration(Date.now() - Date.parse(runtime.startedAt))}`;
  }
  if (runtime.error) return runtime.error;
  if (runtime.exitCode !== null) return `Exited with code ${runtime.exitCode}`;
  if (runtime.signal) return `Stopped by ${runtime.signal}`;
  return "Not running";
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatResourceMetric(metric) {
  const cpu = metric.cpuPercent === null ? "N/A" : `${metric.cpuPercent.toFixed(1)}%`;
  const memory = metric.memoryPercent === null ? "N/A" : `${metric.memoryPercent.toFixed(1)}%`;
  const rss = metric.memoryRssMb === null ? "" : ` · ${metric.memoryRssMb.toFixed(1)} MB`;
  return `CPU ${cpu} · RAM ${memory}${rss}`;
}

function applyMetrics(snapshot) {
  if (!snapshot) return;
  for (const metric of snapshot.bots ?? []) {
    resourceMetrics.set(metric.botId, metric);
    const element = botListElement.querySelector(`[data-resource-for="${CSS.escape(metric.botId)}"]`);
    if (element) element.textContent = formatResourceMetric(metric);
  }
  const cpu = snapshot.system?.cpuPercent;
  const memory = snapshot.system?.memoryPercent;
  const healthValue = document.querySelector("#system-health-value");
  const healthFoot = document.querySelector("#system-health-foot");
  if (healthValue && cpu !== null && cpu !== undefined) healthValue.textContent = `${cpu.toFixed(0)}%`;
  if (healthFoot && memory !== null && memory !== undefined) healthFoot.textContent = `System CPU · RAM ${memory.toFixed(0)}% used`;
}

function updateUptimes() {
  for (const element of botListElement.querySelectorAll("[data-uptime-for]")) {
    const runtime = statusFor(element.dataset.uptimeFor);
    element.textContent = formatBotMeta(runtime);
  }
}

function actionButton(label, action, id, style, disabled = false) {
  const button = createElement("button", `small-button ${style}`, label);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.id = id;
  button.disabled = disabled;
  return button;
}

function formatLog(entry) {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  return `[${time}] [${entry.stream.toUpperCase()}] ${entry.line}`;
}

function appendLog(entry) {
  const entries = logs.get(entry.botId) ?? [];
  entries.push(entry);
  if (entries.length > 300) entries.splice(0, entries.length - 300);
  logs.set(entry.botId, entries);

  const output = botListElement.querySelector(`[data-log-output="${CSS.escape(entry.botId)}"]`);
  if (output) {
    output.textContent = entries.map(formatLog).join("\n");
    output.scrollTop = output.scrollHeight;
  }
}

function openDialog(bot = null) {
  editingBotId = bot?.id ?? null;
  form.reset();
  formError.textContent = "";
  document.querySelector("#dialog-title").textContent = bot ? "Edit bot" : "Add a bot";
  saveButton.textContent = bot ? "Save changes" : "Save bot";

  if (bot) {
    form.elements.namedItem("name").value = bot.name;
    form.elements.namedItem("cwd").value = bot.cwd;
    form.elements.namedItem("executable").value = bot.executable;
    form.elements.namedItem("args").value = bot.args.join("\n");
  }

  dialog.showModal();
  form.elements.namedItem("name").focus();
}

function closeDialog() {
  dialog.close();
  editingBotId = null;
  formError.textContent = "";
}

document.querySelector("#add-bot-button").addEventListener("click", () => openDialog());
document.querySelector("#empty-add-button").addEventListener("click", () => openDialog());
document.querySelector("#close-dialog").addEventListener("click", closeDialog);
document.querySelector("#cancel-dialog").addEventListener("click", closeDialog);

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (!dialog.open) openDialog();
  }
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeDialog();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";
  saveButton.disabled = true;

  const formData = new FormData(form);
  const input = {
    name: String(formData.get("name") ?? "").trim(),
    cwd: String(formData.get("cwd") ?? "").trim(),
    executable: String(formData.get("executable") ?? "").trim(),
    args: String(formData.get("args") ?? "").split(/\r?\n/).map((arg) => arg.trim()).filter(Boolean)
  };

  try {
    const wasEditing = Boolean(editingBotId);
    if (wasEditing) await window.botlands.bots.update(editingBotId, input);
    else await window.botlands.bots.create(input);
    closeDialog();
    await refreshBots();
    showNotice(wasEditing ? "Bot configuration updated." : "Bot added to your workspace.");
  } catch (error) {
    formError.textContent = error.message || "Could not save this bot.";
  } finally {
    saveButton.disabled = false;
  }
});

botListElement.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const bot = bots.find((item) => item.id === button.dataset.id);
  if (!bot) return;

  button.disabled = true;
  try {
    switch (button.dataset.action) {
      case "start":
        await window.botlands.bots.start(bot.id);
        showNotice(`${bot.name} started.`);
        break;
      case "stop":
        await window.botlands.bots.stop(bot.id);
        showNotice(`${bot.name} stopped.`);
        break;
      case "restart":
        await window.botlands.bots.restart(bot.id);
        showNotice(`${bot.name} restarted.`);
        break;
      case "edit":
        openDialog(bot);
        break;
      case "toggle":
        await window.botlands.bots.setEnabled(bot.id, !bot.enabled);
        await refreshBots();
        break;
      case "remove":
        if (window.confirm(`Remove "${bot.name}" from Botlands? This does not delete its files.`)) {
          await window.botlands.bots.remove(bot.id);
          logs.delete(bot.id);
          statuses.delete(bot.id);
          await refreshBots();
        }
        break;
    }
  } catch (error) {
    showNotice(error.message || "The requested action failed.", true);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
});

setInterval(updateUptimes, 1000);\ninitializeDashboard();
