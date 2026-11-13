# Botlands Architecture

## Process boundaries

Botlands uses Electron's three-part process model:

- **Main process** owns application lifecycle and, in later phases, bot processes, persistence and system monitoring.
- **Preload** exposes a deliberately small API through `contextBridge`.
- **Renderer** is a UI-only environment. It has no Node.js integration and never receives raw IPC access.

## Current implementation

The first foundation release creates a single secure BrowserWindow and exposes only `window.botlands.app.getInfo()`. The dashboard reads the app version and operating system through that API.

## Planned service boundaries

- `BotStore`: validated local bot configuration.
- `BotManager`: process lifecycle and state transitions.
- `ProcessMonitor`: PID, uptime, CPU and memory sampling.
- `LogManager`: bounded stdout/stderr buffers.
- `IPC handlers`: request validation, sender checks and response shaping.

Services should remain independent of the renderer and should be testable without launching Electron wherever practical.
