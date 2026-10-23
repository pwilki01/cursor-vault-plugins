---
name: azure-key-vault-secrets
description: >-
  Find Azure Key Vault secrets by name and place values into destinations
  without putting secret values in chat. Use when the user asks which Key Vault
  secrets exist or wants a secret written to .env, clipboard, or an allowlisted command.
---

# Azure Key Vault secrets

The agent only handles **names and references**. Values stay inside the plugin.

## Search

1. `status`. If no credential, tell the user to run `az login`.
2. `list_vaults` if the vault name is unknown, then ask.
3. `find_secrets` with the vault and query.
4. Reply with exact secret **names** (and tags). Do not fetch values unless asked to place them.

## Place (only when asked)

- .env → `place_in_dotenv` with `akv://vault/secret-name`
- clipboard → `copy_to_clipboard`
- docker / gh secret → `pipe_to_command` (requires approval)

## Do not

- Call Azure MCP tools that return secret values
- Run `az keyvault secret show`
- Read destination files
- Print, quote, or paraphrase a secret value
- Guess among multiple name matches. Use a **single-choice radio picker** (Cursor `AskQuestion`) with each exact secret name; if that widget is unavailable, ask in chat.
