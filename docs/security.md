# Security Baseline

Botlands executes programs with the permissions of the current operating-system user. It is a process manager, not a sandbox for untrusted code.

## Electron defaults

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- Local renderer assets and a restrictive Content Security Policy.
- No raw `ipcRenderer`, Node.js modules or filesystem APIs exposed to the renderer.

## IPC requirements

Every privileged IPC handler validates the sender and payload. The preload exposes task-specific bot configuration and lifecycle methods rather than generic channel or command execution. Executable paths and argument arrays are passed separately to `spawn`; `shell: false` is mandatory for the standard process path. Status and log subscriptions expose only structured payloads and return unsubscribe functions.

## Process execution requirements

Before a bot starts, Botlands verifies that its working directory exists and is a directory. Executable resolution is delegated to the operating system PATH when a bare command is configured. Processes run with the current user's permissions and inherited environment. Clearly communicate that user-configured programs can access the user's files and permissions. Never claim that Botlands isolates or makes untrusted scripts safe. Process trees are terminated on stop and when the application exits.

## Secrets

Do not store bot tokens or credentials in ordinary plaintext configuration. A dedicated operating-system credential store is a prerequisite before adding first-class secret management.
