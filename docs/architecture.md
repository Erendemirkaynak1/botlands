# Botlands Architecture

## Process boundaries

Botlands uses Electron's three-part process model:

- **Main process** owns application lifecycle and, in later phases, bot processes, persistence and system monitoring.
- **Preload** exposes a deliberately small API through `contextBridge`.
- **Renderer** is a UI-only environment. It has no Node.js integration and never receives raw IPC access.

## Current implementation

The current foundation creates a secure BrowserWindow and exposes a narrow `window.botlands` API. The renderer can read app information and perform bot configuration CRUD operations. `BotStore` serializes writes, persists versioned JSON under Electron's user data directory, validates records on read, and uses a temporary file plus rename for safer writes.

## Planned service boundaries

- `BotStore`: validated local bot configuration.
- `BotManager`: process lifecycle and state transitions.
- `ProcessMonitor`: PID, uptime, CPU and memory sampling.
- `LogManager`: bounded stdout/stderr buffers.
- `IPC handlers`: request validation, sender checks and response shaping.

Services should remain independent of the renderer and should be testable without launching Electron wherever practical.
