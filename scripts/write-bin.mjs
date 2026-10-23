import fs from "node:fs";
import path from "node:path";

const UNIX_PATH_SUFFIX = "/usr/local/bin:/opt/homebrew/bin:${HOME}/.local/bin";

export function writeBinLauncher(pluginDir, name, distRel) {
  const binDir = path.join(pluginDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const unix = `#!/bin/sh
PATH="\${PATH:-/usr/bin:/bin}:${UNIX_PATH_SUFFIX}"
export PATH
if command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
elif [ -x /usr/local/bin/node ]; then
  NODE=/usr/local/bin/node
elif [ -x /opt/homebrew/bin/node ]; then
  NODE=/opt/homebrew/bin/node
else
  echo "node is not installed or not on PATH" >&2
  exit 127
fi
DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
exec "$NODE" "$DIR/../${distRel}" "$@"
`;
  const file = path.join(binDir, name);
  fs.writeFileSync(file, unix);
  fs.chmodSync(file, 0o755);
  fs.writeFileSync(
    `${file}.cmd`,
    `@echo off\r\nset PATH=%PATH%;%ProgramFiles%\\nodejs;%LOCALAPPDATA%\\Programs\\nodejs\r\nnode "%~dp0..\\${distRel.replace(/\//g, "\\")}" %*\r\n`,
  );
}
