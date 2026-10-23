# Cursor vault plugins

Unofficial Cursor plugins for **Bitwarden** and **Azure Key Vault**. You name a login or secret; the agent gets metadata and a reference; the plugin writes the value to a destination. Passwords never appear in chat, tool results, hook output, or logs.

Not affiliated with Bitwarden, Inc. or Microsoft.

## What the agent can do

Ask:

> Tell me if there are any logins related to aon intelligence.

The Bitwarden plugin calls `find_logins`. You get back **exact login names** (plus username, URI host, and folder). It searches only those fields — never password, TOTP, notes, or custom fields.

When you ask to place a password, destinations are:

- a `.env` key
- a rendered template
- a command environment via `secret-run`
- an allowlisted command's stdin
- the clipboard (auto-clear)

## Install (local)

```bash
npm install
npm test
npm run build
ln -s "$(pwd)/plugins/bitwarden" ~/.cursor/plugins/local/bitwarden
ln -s "$(pwd)/plugins/azure-key-vault" ~/.cursor/plugins/local/azure-key-vault
```

Restart Cursor. Optional: install `extensions/bitwarden-signin` so sign-in can open inside Cursor's terminal.

Prerequisites: [Bitwarden CLI](https://bitwarden.com/help/cli/) (`brew install bitwarden-cli`) and/or Azure CLI (`az login`).

## Security model

- MCP tools never return a secret value, length, or hash.
- `bw list items` JSON is stripped in-process before matching or logging.
- Destination files are gitignored, cursorignored, and mode 0600.
- Hooks block `bw get password`, `bw list items`, `az keyvault secret show`, and reads of placed files.

## Limits

- An app can still log a value after it receives it. `secret-run` only masks wrapped command output.
- Clipboard managers can capture the clipboard; auto-clear is best effort.
- Cursor's `beforeReadFile` hook may receive file contents if a read slips through; `.cursorignore` is the main defense.

## Layout

- `packages/core` — shared refs, destinations, masker, hooks I/O
- `packages/bitwarden` — CLI wrapper, `find_logins`, MCP server
- `packages/azure-key-vault` — Key Vault metadata search and placement
- `plugins/*` — installable Cursor plugins (committed `dist/`)
- `extensions/bitwarden-signin` — companion URI handler
