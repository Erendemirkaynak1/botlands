# Botlands Architecture

## Process boundaries

Botlands uses Electron's three-part process model:

- **Main process** owns application lifecycle, bot processes, persistence and system monitoring.
- **Preload** exposes a deliberately small API through `contextBridge`.
- **Renderer** is a UI-only environment. It has no Node.js integration and never receives raw IPC access.

## Current implementation

The current foundation creates a secure BrowserWindow and exposes a narrow `window.botlands` API. The renderer can read app information, manage bot configuration, and invoke start/stop/restart actions. `BotStore` serializes writes, persists versioned JSON under Electron's user data directory, validates records on read, and uses a temporary file plus rename for safer writes. `BotManager` serializes lifecycle operations per bot, validates the working directory, launches executable/argument arrays with `shell: false`, tracks PID and state, streams stdout/stderr events, and terminates process trees through `tree-kill`. Stop escalates from a graceful signal to a forced kill after a timeout; if the child still does not close, Botlands reports the failure and retains the runtime reference rather than claiming the process stopped. Active processes are stopped when the application exits.

## Planned service boundaries

- `BotStore`: validated local bot configuration.
- `BotManager`: process lifecycle and state transitions. Implemented in `src/main/services/bot-manager.js`.
- `ProcessMonitor`: system-wide and per-bot CPU/RAM sampling every three seconds. Implemented in `src/main/services/process-monitor.js`.
- `LogManager`: bounded stdout/stderr buffers in the renderer; Main emits bounded log chunks and preserves partial lines.
- `IPC handlers`: request validation, sender checks and response shaping.

Services should remain independent of the renderer and should be testable without launching Electron wherever practical.
