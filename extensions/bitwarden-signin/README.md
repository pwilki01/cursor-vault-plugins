# Bitwarden sign-in (Cursor companion)

Install this extension so the Bitwarden Cursor plugin can open sign-in inside Cursor's terminal.

The URI handler only runs the plugin's `bw-login` helper after a one-time nonce match. It never takes a command from the URI.

Package a vsix:

```
cd extensions/bitwarden-signin
npx @vscode/vsce package
```
