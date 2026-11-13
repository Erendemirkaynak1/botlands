const versionElement = document.querySelector("#app-version");
const platformElement = document.querySelector("#platform-label");
const botListElement = document.querySelector("#bot-list");
const emptyStateElement = document.querySelector("#empty-state");
const dialog = document.querySelector("#bot-dialog");
const form = document.querySelector("#bot-form");
const formError = document.querySelector("#form-error");
const saveButton = document.querySelector("#save-bot-button");

const platformNames = { win32: "Windows", darwin: "macOS", linux: "Linux" };
let bots = [];
let editingBotId = null;

async function initializeDashboard() {
  try {
    const info = await window.botlands.app.getInfo();
    versionElement.textContent = `v${info.version}`;
    platformElement.textContent = platformNames[info.platform] ?? info.platform;
    document.title = `Botlands v${info.version}`;
    await refreshBots();
  } catch (error) {
    versionElement.textContent = "App info unavailable";
    showError(error);
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

  const enabledCount = bots.filter((bot) => bot.enabled).length;
  document.querySelector("#total-bots").textContent = String(bots.length);
  document.querySelector("#running-bots").textContent = "0";
  document.querySelector("#stopped-bots").textContent = String(enabledCount);
  document.querySelector("#list-count").textContent = `${bots.length} configured`;\n  document.querySelector("#nav-bot-count").textContent = String(bots.length);

  for (const bot of bots) {
    const card = createElement("article", "bot-card");
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
      bot.enabled ? "bot-status configured" : "bot-status disabled",
      bot.enabled ? "Configured" : "Disabled"
    );

    const actions = createElement("div", "bot-actions");
    actions.append(
      actionButton("Edit", "edit", bot.id, "subtle"),
      actionButton(bot.enabled ? "Disable" : "Enable", "toggle", bot.id, "subtle"),
      actionButton("Remove", "remove", bot.id, "danger")
    );
    card.append(identity, status, actions);
    botListElement.append(card);
  }
}

function actionButton(label, action, id, style) {
  const button = createElement("button", `small-button ${style}`, label);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
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
    form.elements.args.value = bot.args.join("\n");
  }

  dialog.showModal();
  form.elements.namedItem("name").focus();
}

function closeDialog() {
  dialog.close();
  editingBotId = null;
  formError.textContent = "";
}

function showError(error) {
  console.error(error);
  formError.textContent = error instanceof Error ? error.message : "Something went wrong. Please try again.";
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
    if (editingBotId) {
      await window.botlands.bots.update(editingBotId, input);
    } else {
      await window.botlands.bots.create(input);
    }
    closeDialog();
    await refreshBots();
  } catch (error) {
    showError(error);
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
    if (button.dataset.action === "edit") {
      openDialog(bot);
    } else if (button.dataset.action === "toggle") {
      await window.botlands.bots.setEnabled(bot.id, !bot.enabled);
      await refreshBots();
    } else if (button.dataset.action === "remove") {
      if (window.confirm(`Remove "${bot.name}" from Botlands? This does not delete its files.`)) {
        await window.botlands.bots.remove(bot.id);
        await refreshBots();
      }
    }
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
});

initializeDashboard();
