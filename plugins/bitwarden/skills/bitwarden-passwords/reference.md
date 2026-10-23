# Bitwarden passwords — reference

## Tools

| Tool | Returns |
|------|---------|
| `status` | `unauthenticated` / `locked` / `unlocked`, login command |
| `find_logins` | exact names, username, URI hosts, folder — **never secrets** |
| `login` / `wait_for_signin` | window status / vault state |
| `unlock` / `lock` | vault lock state |
| `place_in_dotenv` | `{ status, path, key }` |
| `render_template` | `{ status, path }` |
| `copy_to_clipboard` | `{ status, clearAfterSeconds }` |
| `pipe_to_command` | masked stdout/stderr |
| `list_placements` / `refresh_placements` / `remove_placement` | refs and destinations |

## find_logins matching

Query tokens are AND-matched, case-insensitive, against:

- item name
- username
- URI hosts
- folder name

Not matched: password, TOTP, notes, custom fields, attachments, history.

Default: login items only (`type === 1`). Pass `includeNonLogins: true` only if the user asks for notes/cards/identities by name.

## Project config

`.cursor/secrets.json` (no values):

```json
{
  "env": { "DB_PASSWORD": "bw://Prod SQL/password" },
  "wrap_commands": ["npm run dev"],
  "wrap_mode": "rewrite",
  "env_files": [".env"]
}
```

## Debugging hooks

Cursor Settings → Hooks → Execution Log. Look for `shell-guard`, `read-guard`, `mcp-guard`.
