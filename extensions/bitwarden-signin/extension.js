const fs = require("fs");
const os = require("os");
const path = require("path");
let vscode;
try {
  vscode = require("vscode");
} catch {
  vscode = null;
}

const BANNER = "=== Bitwarden sign-in (cursor-vault-plugins) ===";
const HOME = path.join(os.homedir(), ".cursor", "secret-plugins");

function noncePath() {
  return path.join(HOME, "login-nonce");
}
function ackPath() {
  return path.join(HOME, "login-ack");
}
function registryPath() {
  return path.join(HOME, "registry.json");
}

function loginHelperPath() {
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath(), "utf8"));
    const plugin = (registry.plugins || []).find((p) => p.scheme === "bw" || p.name === "bitwarden");
    if (plugin?.loginHelper && fs.existsSync(plugin.loginHelper)) return plugin.loginHelper;
  } catch {
    /* ignore */
  }
  return null;
}

function consumeNonce(expected) {
  const file = noncePath();
  let current = "";
  try {
    current = fs.readFileSync(file, "utf8").trim();
  } catch {
    return false;
  }
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
  return Boolean(expected && current === expected);
}

function deleteTerminalCopy(pid) {
  const projects = path.join(os.homedir(), ".cursor", "projects");
  if (!fs.existsSync(projects)) return;
  for (const project of fs.readdirSync(projects)) {
    const dir = path.join(projects, project, "terminals");
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      let text = "";
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const pidLine = text.split("\n").find((l) => l.startsWith("pid:"));
      const filePid = pidLine ? pidLine.replace("pid:", "").trim() : "";
      if (String(filePid) === String(pid) || text.includes(BANNER)) {
        try {
          fs.unlinkSync(file);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

function bannerStillPresent() {
  const projects = path.join(os.homedir(), ".cursor", "projects");
  if (!fs.existsSync(projects)) return false;
  for (const project of fs.readdirSync(projects)) {
    const dir = path.join(projects, project, "terminals");
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      try {
        if (fs.readFileSync(path.join(dir, name), "utf8").includes(BANNER)) return true;
      } catch {
        /* ignore */
      }
    }
  }
  return false;
}

function writeAck(ok) {
  fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
  fs.writeFileSync(ackPath(), JSON.stringify({ ok, at: new Date().toISOString() }), { mode: 0o600 });
}

function writeCleanupStatus(ok) {
  fs.writeFileSync(path.join(HOME, "login-cleanup.json"), JSON.stringify({ ok, at: new Date().toISOString() }), {
    mode: 0o600,
  });
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  if (!vscode) return;
  const handler = {
    handleUri(uri) {
      if (uri.path !== "/login" && uri.path !== "login") return;
      const nonce = uri.query.replace(/^nonce=/, "").split("&")[0];
      if (!consumeNonce(nonce)) return;
      const helper = loginHelperPath();
      if (!helper) return;
      writeAck(true);
      const term = vscode.window.createTerminal({
        name: "Bitwarden sign-in",
        shellPath: helper,
        isTransient: true,
      });
      term.show();
      const pid = term.processId;
      const cleanup = async () => {
        try {
          term.dispose();
        } catch {
          /* ignore */
        }
        const resolvedPid = await pid;
        deleteTerminalCopy(resolvedPid);
        setTimeout(() => {
          deleteTerminalCopy(resolvedPid);
          writeCleanupStatus(!bannerStillPresent());
        }, 2000);
      };
      context.subscriptions.push(
        vscode.window.onDidCloseTerminal((t) => {
          if (t === term) void cleanup();
        }),
      );
    },
  };
  context.subscriptions.push(vscode.window.registerUriHandler(handler));
}

function deactivate() {}

module.exports = { activate, deactivate, consumeNonce, loginHelperPath, deleteTerminalCopy, BANNER };
