# Cursor vault plugins

Unofficial Cursor plugins for **Bitwarden** and **Azure Key Vault**. You name a login or secret; the agent gets metadata and a reference; the plugin writes the value to a destination. Passwords never appear in chat, tool results, hook output, or logs.

Not affiliated with Bitwarden, Inc. or Microsoft.

## What the agent can do

Ask:

> Tell me if there are any logins related to acme corp.

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
- Hooks block `bw get password`, `bw list items`, `az keyvault secret show`, and reads of placed files. Commands are normalized first, so quoting tricks like `b''w` and `$VAR` indirection are caught.
- Hooks also block reads of the Bitwarden session key (`BW_SESSION`, the OS keychain entry, `~/.cursor/secret-plugins/`, the Bitwarden CLI data folder), `bw --session`, direct calls to `*.vault.azure.net`, and Key Vault access tokens.
- If a hook fails on vault-related input, it denies the call instead of allowing it.

## Limits

- **The hooks stop accidental and casual leaks, not a determined agent.** They inspect the command text Cursor shows them. An agent that encodes a payload, or writes a script in one step and runs it in the next, can get past a string match. The main protection is that the agent never needs a value: placement tools write it straight to the destination. For hard isolation, run the agent's shell as a separate OS user or in a sandbox that cannot reach your keychain or `az` login.
- Hooks only see the Shell, Read, and MCP calls Cursor routes through them. They do not see processes those commands start.
- An app can still log a value after it receives it. `secret-run` only masks wrapped command output.
- Clipboard managers can capture the clipboard; auto-clear is best effort.
- Cursor's `beforeReadFile` hook may receive file contents if a read slips through; `.cursorignore` is the main defense.

## Layout

- `packages/core` — shared refs, destinations, masker, hooks I/O
- `packages/bitwarden` — CLI wrapper, `find_logins`, MCP server
- `packages/azure-key-vault` — Key Vault metadata search and placement
- `plugins/*` — installable Cursor plugins (committed `dist/`)
- `extensions/bitwarden-signin` — companion URI handler
