---
name: bitwarden-passwords
description: >-
  Search Bitwarden logins by name and place passwords into destinations without
  ever putting secret values in chat. Use when the user asks if a login exists,
  wants logins related to a name (for example "acme corp"), or wants a
  password written to .env, a template, the clipboard, a command, or a process
  environment.
---

# Bitwarden passwords

The agent only handles **references and metadata**. Secret values stay inside the plugin.

## Search-only questions (do this first)

For any question like:

- "are there logins related to acme corp?"
- "is there a login for X / named X?"
- "what is the exact login name for …?"

1. Call `status`. If `unauthenticated`, call `login` then `wait_for_signin` until signed in. If `locked`, call `unlock`.
2. Call `find_logins` with the user's words as `query` (for example `acme corp`).
3. Reply with the **exact** `name` values from `matches` (username, URI host, and folder are ok to show).
4. **Stop.** Do not call `place_*`, `copy_to_clipboard`, or `pipe_to_command` unless the user asked to put the password somewhere.
5. If `count` is 0, say no logins matched.
6. If `count` is greater than 1 and they asked to place or copy a password, **do not list bullets in chat**. Open a **single-choice radio picker** (Cursor `AskQuestion`; `allow_multiple` false). One option per match. Label: exact name — username — URI host — folder. Option `id`: the exact `name`, or the match `id` if two names are the same. Wait for the selection. Never guess. If that widget is unavailable, then list every exact name and ask.

`find_logins` searches only **name, username, URI host, and folder**. It never returns passwords, TOTP, notes, or field values.

## Place a password (only when asked)

Map the request:

- "put it in .env" → `place_in_dotenv` with `ref` like `bw://Exact Login Name/password`
- "put it in the config" → write `{{bw://Exact Login Name/password}}` in a **template** file, then `render_template` to a different gitignored output. Never edit the rendered output.
- "run the app with it" → add the ref to `.cursor/secrets.json` and use `secret-run`
- "log in to docker" / "set the GitHub secret" → `pipe_to_command` (user must approve)
- "I'll paste it" → `copy_to_clipboard`

After placing, confirm using metadata only (path, key, login name). Never read the destination file.

## Do not

- Ask the user to paste a password into chat
- Read destination files, `.env` (except `.example` / `.sample` / `.template`), or Cursor `terminals/` transcripts
- Pass secret values as tool arguments
- Run `bw get password`, `bw list items`, `bw export`, or any CLI that prints vault secrets
- Write into git-tracked files
- Type passwords with browser tools (use the clipboard)
- Fetch a password just to "show the login"
- Quote, paraphrase, or print a secret. If the user pastes one into chat anyway, warn them and recommend rotating it.

## Unlock and login

- `login` opens a Cursor terminal (or an external terminal). Tell the user to finish there. Then `wait_for_signin`.
- `unlock` opens a native OS dialog. The master password never appears in chat.

See [reference.md](reference.md).
