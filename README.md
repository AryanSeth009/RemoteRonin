# RemoteRonin

**One installation. One terminal. Multiple developer tools. Remote access from anywhere.**

RemoteRonin is a real Windows command center for inspecting developer tools, configuring Chrome Remote Desktop, registering projects, reviewing Git changes, and verifying browser previews. Its core uses only built-in Node.js modules, so setup does not depend on a package registry.

Built by Aryan Seth.

## Install

Open PowerShell in this repository:

```powershell
.\setup.ps1
.\start.cmd
```

The core is dependency-free and works without network access. To enable `/screenshot`, install the optional browser automation package:

```powershell
npm install playwright
npx playwright install chromium
```

The installer is repeatable. It does not read provider credentials, overwrite AI-tool configuration, store remote desktop PINs, or expose a public command server.

## Guided terminal installation

Inside the RemoteRonin terminal, run:

```text
/setup
```

Choose a number to install the required core, AI developer tools, browser verification, or everything recommended. RemoteRonin shows the selected scope and asks for confirmation before downloading software or requesting Windows elevation. Installed components are skipped when their health check succeeds.

For scripts, the equivalent noninteractive command requires explicit approval:

```powershell
.\start.cmd setup install recommended --yes
```

Chrome Remote Desktop account authentication and PIN creation remain manual on Google's official setup page.

## Terminal artwork

The startup screen includes a terminal-native red/white/black shinobi portrait with a glowing red eye. It uses ANSI characters, so it remains visible over remote desktop without requiring a browser image protocol.

```text
/settings art off
/settings art on
```

## Commands

Use interactive slash commands such as `/help`, `/setup`, `/doctor`, `/tools`, `/remote`, `/project add`, `/changes`, `/diff`, `/preview`, and `/screenshot`. Most commands also work noninteractively:

```powershell
.\start.cmd doctor
.\start.cmd tools
.\start.cmd project add "D:\Projects\My App" "My App"
.\start.cmd changes
.\start.cmd preview http://localhost:3000
```

Chrome Remote Desktop authorization and PIN creation are intentionally completed by the user on Google's official page:

```powershell
.\start.cmd remote open
```

## Local data

User-specific configuration, logs, and screenshots are stored under `%APPDATA%\RemoteRonin` and are not committed. Set `REMOTERONIN_HOME` to use another location. The legacy `DEVREMOTE_HOME` variable remains supported; if the normal directory is read-only, RemoteRonin safely falls back to `.remoteronin` in the current project.

## Verification

```powershell
npm run check
.\scripts\verify-install.ps1
```
