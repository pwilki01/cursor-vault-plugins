import path from "node:path";
import { loadProjectConfig, defaultWrapMode } from "../../../core/src/config.ts";
import { commandFrom, readStdinText, writeHookDecision, workspaceRootsFrom } from "../../../core/src/hook-io.ts";
import { bitwardenLeak, looksVaultRelated } from "../../../core/src/command-guard.ts";
import { looksLikeEnvFile, isEnvException } from "../../../core/src/paths.ts";
import { placedPaths } from "../../../core/src/placements.ts";
import { SIGNIN_BANNER } from "../login-launch.ts";
import { effectiveStatus } from "../session.ts";

const READ_CMDS = /\b(cat|head|tail|less|more|grep|rg|sed|awk|source|\.|base64|cp|type|Get-Content)\b/i;
const ENV_DUMP = /\b(env|printenv|export\s+-p)\b/;
const PBPASTE = /\bpbpaste\b/;
const TERMINALS_DIR = /[\\/]\.cursor[\\/]projects[\\/].*[\\/]terminals[\\/]/i;

function deny(agent: string, user?: string) {
  writeHookDecision({
    permission: "deny",
    agent_message: agent,
    user_message: user ?? agent,
  });
}

function allow(extra?: { updated_input?: Record<string, unknown> }) {
  writeHookDecision({ permission: "allow", ...extra });
}

const raw = await readStdinText();
let command = "";
try {
  const input = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
  command = commandFrom(input);
  const roots = workspaceRootsFrom(input);
  const root = roots[0] ?? process.cwd();

  const leak = bitwardenLeak(command);
  if (leak === "bw-cli") {
    deny(
      "Do not use the Bitwarden CLI to read secrets. Call find_logins for names, or place_in_dotenv / copy_to_clipboard / pipe_to_command / render_template to place a value.",
    );
    process.exit(0);
  }
  if (leak) {
    deny("Do not read the Bitwarden session key or the plugin's credential storage.");
    process.exit(0);
  }

  const config = loadProjectConfig(root);

  if (TERMINALS_DIR.test(command) || command.includes(SIGNIN_BANNER)) {
    deny("Do not read Cursor terminal transcripts during Bitwarden sign-in.");
    process.exit(0);
  }

  if (PBPASTE.test(command)) {
    deny("Do not read the clipboard. If a secret was copied, it is for the user to paste.");
    process.exit(0);
  }

  const guarded = [
    ...(config.env_files ?? []).map((p) => path.resolve(root, p)),
    ...placedPaths(root),
  ];
  if (READ_CMDS.test(command)) {
    const touchesGuarded = guarded.some((p) => command.includes(p) || command.includes(path.relative(root, p)));
    const touchesEnv = /\.env(\.|$|\s|"|')/.test(command) && !isEnvException(command);
    if (touchesGuarded || touchesEnv || looksLikeEnvFile(command)) {
      deny("Do not read secret destination files. Use find_logins or list_placements for metadata.");
      process.exit(0);
    }
  }

  if (ENV_DUMP.test(command) && /secret-run/.test(command)) {
    deny("Do not dump the environment inside secret-run.");
    process.exit(0);
  }

  const wraps = config.wrap_commands ?? [];
  const matched = wraps.find((prefix) => command.trimStart().startsWith(prefix));
  if (matched && !command.includes("secret-run")) {
    const st = await effectiveStatus();
    if (st.state === "locked" || st.state === "unauthenticated") {
      deny(
        st.state === "unauthenticated"
          ? "Bitwarden is not logged in. Call login, then wait_for_signin."
          : "Bitwarden vault is locked. Call unlock first.",
      );
      process.exit(0);
    }
    const pluginRoot = process.env.CURSOR_PLUGIN_ROOT ?? path.resolve(root);
    const wrapped = `${pluginRoot}/bin/secret-run -- ${command}`;
    if (defaultWrapMode(config) === "suggest") {
      deny(`Run this command through secret-run: ${wrapped}`);
      process.exit(0);
    }
    allow({ updated_input: { command: wrapped } });
    process.exit(0);
  }

  allow();
} catch {
  if (looksVaultRelated(command || raw)) {
    deny("The Bitwarden guard could not check this command, so it was blocked.");
  } else {
    allow();
  }
}
process.exit(0);
