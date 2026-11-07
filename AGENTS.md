# RemoteRonin contributor instructions

- Preserve real detection and explicit `UNKNOWN`/verification states; never add simulated operational data.
- Never read, store, or log remote-access PINs, tokens, cookies, or provider credentials.
- Keep commands registered in the shared registry so interactive and noninteractive behavior remain aligned.
- Require explicit approval before privileged installation, destructive operations, or power-setting changes.
- Run `npm run check` after source changes.
