# Botlands — Universal Bot Control Center

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-informational)
![Project status](https://img.shields.io/badge/status-in%20development-blue)

**Botlands** is an open-source, cross-platform desktop application designed to manage locally running bots, scripts, and automation tasks from one central interface.

The goal is to support programs written in different languages and technologies, including Discord and Telegram bots, web-scraping jobs, Python scripts, Node.js applications, Windows batch files, and other executable programs.

> **Project status:** The initial Electron foundation and dashboard are in place. Bot configuration and process management are being developed in stages; release installers are not available yet.

## Goals and planned features

- Add, edit, remove, and disable bot configurations.
- Start, stop, and restart individual bots.
- Display lifecycle states such as starting, running, stopped, and failed.
- Stream standard output (stdout) and standard error (stderr) into an in-app console.
- Display process ID, uptime, and basic CPU/RAM usage.
- Persist bot definitions and application preferences locally.
- Support Windows first, while keeping Linux and macOS compatibility in scope.

## Technology stack

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Desktop runtime | Electron.js | Application lifecycle, windows, and packaging |
| Main process | Node.js | Process management, filesystem access, and IPC |
| Secure bridge | Electron Preload + contextBridge | Expose a limited API to the renderer |
| User interface | HTML5, CSS3, Vanilla JavaScript | Lightweight, readable frontend |
| Local configuration | Node.js filesystem APIs | Atomic local JSON storage with validated bot records |
| System metrics | Planned | CPU, memory, and process statistics in a later phase |
| Process tree handling | Planned | Cross-platform child-process termination support |
| Packaging | Electron Forge | Application packaging and distribution |

## Architecture and security

Botlands follows Electron's process separation model:

1. **Main process:** Validates requests, owns bot processes, manages local configuration, and collects system metrics.
2. **Preload:** Exposes a small, explicitly defined API through `contextBridge`.
3. **Renderer:** Displays the interface and calls the exposed API. It does not access Node.js modules, the filesystem, or raw IPC directly.

Security defaults:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- A restrictive Content Security Policy and locally loaded application content.
- IPC channel allowlisting, payload validation, and sender verification.
- No exposure of the raw `ipcRenderer` object to the renderer.
- Process execution uses `shell: false` by default, with executable paths and arguments kept separate.
- Working directories, executable paths, and environment variable names are validated.

**Security notice:** Botlands launches programs on the user's own computer. A configured bot can run with the permissions of the current user. Botlands is not a security sandbox for untrusted code. Users should only run scripts they trust. Secrets and tokens should not be stored as plaintext in ordinary JSON configuration; operating-system credential storage should be considered for sensitive values.

## Proposed project structure

```text
botlands/
├── src/
│   ├── main/
│   │   ├── index.js                 # Electron entry point and BrowserWindow
│   │   ├── ipc/
│   │   │   ├── index.js             # Register IPC handlers
│   │   │   ├── bot-handlers.js      # Bot CRUD and lifecycle channels
│   │   │   └── system-handlers.js   # System metrics channels
│   │   ├── services/
│   │   │   ├── bot-manager.js       # Bot process lifecycle
│   │   │   ├── process-monitor.js   # CPU/RAM/PID monitoring
│   │   │   └── log-manager.js       # stdout/stderr streams and buffers
│   │   ├── storage/
│   │   │   └── bot-store.js         # Local JSON configuration
│   │   └── utils/
│   │       ├── command-parser.js    # Executable and argument handling
│   │       ├── path-utils.js        # Platform-aware path helpers
│   │       └── validation.js        # Input validation
│   ├── preload/
│   │   └── index.cjs                # contextBridge API
│   └── renderer/
│       ├── index.html
│       ├── assets/icons/
│       ├── css/
│       │   ├── reset.css
│       │   ├── variables.css
│       │   ├── layout.css
│       │   └── components.css
│       └── js/
│           ├── app.js
│           ├── state.js
│           ├── api.js               # Calls through window.botlands
│           ├── views/
│           │   ├── dashboard.js
│           │   ├── bot-list.js
│           │   ├── bot-editor.js
│           │   └── console.js
│           └── components/
│               ├── bot-card.js
│               ├── status-badge.js
│               └── modal.js
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── architecture.md
│   └── security.md
├── .github/
│   └── workflows/
│       └── build.yml
├── forge.config.js
├── package.json
├── .gitignore
├── LICENSE
├── README.md
└── roadmap.md
```

## Development environment

### Prerequisites

- Node.js **22.17 or newer** (an active LTS release is recommended).
- npm (included with Node.js).
- Git.
- Windows, Linux, or macOS.
- On Linux, the system libraries required by Electron for your distribution.

### Clone the repository

```bash
git clone https://github.com/Erendemirkaynak1/botlands.git
cd botlands
npm install
npm start
```

The initial Electron shell and bot configuration workflow are now in the repository. Run `npm install` and `npm start` to launch the dashboard locally. Process start/stop and live monitoring are still under development.

### Dependencies

Electron 45 and Electron Forge 8 are configured as development dependencies in `package.json`. Bot configuration currently uses Node.js built-in filesystem APIs, so no additional runtime package is required for the storage layer.

Install the configured dependencies with:

```bash
npm install
```

This generates `package-lock.json`; keep that lockfile committed so local and CI installs use the same dependency tree.

### Build and package

```bash
npm run package
npm run make
```

Electron Forge creates distribution artifacts using the configured makers. For reliable Windows, Linux, and macOS releases, builds should run on matching operating-system runners in CI. Windows code signing and macOS signing/notarization should be configured as part of the release process.

## Planned application workflow

1. The user enters a bot name, working directory, executable, argument list, and environment variables.
2. The Main process validates the configuration and saves it locally.
3. A start request is sent to the Main process through a validated IPC handler.
4. Bot Manager launches the program using an argument array, for example `spawn(executable, args, { cwd, env, shell: false })`.
5. stdout and stderr are streamed to the UI through approved IPC events.
6. The process monitor collects metrics and publishes status updates.
7. Stop and restart operations handle the process tree using platform-aware logic.

## Cross-platform considerations

- **Windows:** `.exe`, `.cmd`, and `.bat` have different execution behavior. Batch files need an explicit Windows-specific adapter. If shell execution is unavoidable, it must be isolated and carefully validated rather than enabling `shell: true` globally.
- **Linux and macOS:** Executable permissions, signals, and process groups must be handled correctly.
- Bots that spawn child processes may leave descendants running if only the parent PID is terminated. Process-tree shutdown and timeout behavior must be tested.
- Commands such as `python` may be resolved through PATH. The UI should make the resolved executable clear to the user.

## Contributing

Contributions are welcome. For significant changes, open an issue first to discuss the proposal. Code contributions should prioritize readability, security, and tests on supported operating systems.

## License

Botlands is distributed under the MIT License. See [LICENSE](LICENSE) for details.

## Technical references

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron Forge](https://www.electronforge.io/)
- [Node.js child_process](https://nodejs.org/api/child_process.html)
- [electron-store](https://github.com/sindresorhus/electron-store)
- [systeminformation](https://github.com/sebhildebrandt/systeminformation)
- [tree-kill](https://github.com/pkrumins/node-tree-kill)
