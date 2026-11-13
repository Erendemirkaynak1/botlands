const versionElement = document.querySelector("#app-version");
const platformElement = document.querySelector("#platform-label");

const platformNames = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux"
};

async function initializeDashboard() {
  try {
    const info = await window.botlands.app.getInfo();
    versionElement.textContent = `v${info.version}`;
    platformElement.textContent = platformNames[info.platform] ?? info.platform;
    document.title = `Botlands v${info.version}`;
  } catch (error) {
    versionElement.textContent = "App info unavailable";
    console.error("Could not load application information:", error);
  }
}

initializeDashboard();
