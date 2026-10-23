import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { logEvent } from "../../core/src/logger.ts";
import { parseRef, type BwRef, findTemplateRefs } from "../../core/src/refs.ts";
import { upsertDotenv } from "../../core/src/dotenv.ts";
import { assertTemplateSafe, renderTemplateText } from "../../core/src/template.ts";
import {
  addDestinationIgnores,
  atomicWriteFile,
  isGitTracked,
  resolveInsideWorkspace,
} from "../../core/src/paths.ts";
import { copyToClipboard, hashValue, clearClipboardIfHash } from "../../core/src/clipboard.ts";
import { isAllowlisted, pipeToCommand } from "../../core/src/pipe.ts";
import { loadProjectConfig } from "../../core/src/config.ts";
import { loadPlacements, recordPlacement, removePlacement, type Placement } from "../../core/src/placements.ts";
import { findPluginByScheme } from "../../core/src/registry.ts";
import { listLoginMetadata, resolveItemField } from "./bw-cli.ts";
import { matchLogins, toFindLoginsResult, type FindLoginsResult } from "./search.ts";
import { effectiveStatus, loadSession, lockVault, touchLastUsed, unlockWithPasswordFile } from "./session.ts";
import { promptMasterPassword } from "./unlock-dialog.ts";

export type ProviderClock = () => number;

export class BitwardenProvider {
  private readonly workspaceRoots: string[];
  private readonly clock?: ProviderClock;

  constructor(workspaceRoots: string[], clock?: ProviderClock) {
    this.workspaceRoots = workspaceRoots;
    this.clock = clock;
  }

  private root(): string {
    const root = this.workspaceRoots[0];
    if (!root) throw new Error("No workspace root.");
    return root;
  }

  async status() {
    return effectiveStatus(this.clock);
  }

  async requireSession(): Promise<string> {
    const session = await loadSession(this.clock);
    if (!session) {
      const st = await this.status();
      if (st.state === "unauthenticated") {
        throw new Error(`Bitwarden is not logged in. Run: ${st.loginCommand}`);
      }
      throw new Error("Bitwarden vault is locked. Call unlock first.");
    }
    touchLastUsed(this.clock);
    return session;
  }

  async findLogins(query: string, includeNonLogins = false): Promise<FindLoginsResult> {
    const session = await this.requireSession();
    const metadata = await listLoginMetadata(session);
    const matches = matchLogins(metadata, query, { includeNonLogins });
    const result = toFindLoginsResult(query, matches);
    logEvent({
      event: "find_logins",
      query,
      count: result.count,
      names: result.matches.map((m) => m.name).join(", "),
    });
    return result;
  }

  async unlock(): Promise<{ status: string }> {
    const password = await promptMasterPassword();
    try {
      await unlockWithPasswordFile(password);
    } finally {
      password.split("").forEach((_, i, arr) => {
        arr[i] = "";
      });
    }
    return { status: "unlocked" };
  }

  async lock(): Promise<{ status: string }> {
    await lockVault();
    return { status: "locked" };
  }

  private async resolveRef(refStr: string): Promise<{ ref: BwRef; value: string }> {
    const parsed = parseRef(refStr);
    if (parsed.scheme !== "bw") {
      throw new Error("This plugin only resolves bw:// references.");
    }
    const session = await this.requireSession();
    const value = await resolveItemField(session, parsed.item, parsed.field);
    return { ref: parsed, value };
  }

  async placeInDotenv(ref: string, destPath: string, key: string) {
    const { value } = await this.resolveRef(ref);
    try {
      const abs = resolveInsideWorkspace(this.workspaceRoots, path.resolve(this.root(), destPath));
      if (await isGitTracked(abs, this.root())) {
        throw new Error("Refusing to write a secret into a git-tracked file.");
      }
      const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      const next = upsertDotenv(current, key, value);
      atomicWriteFile(abs, next);
      addDestinationIgnores(this.root(), abs);
      const placement: Placement = {
        id: randomUUID(),
        ref,
        destination: { kind: "dotenv", path: abs, key },
        createdAt: new Date(this.clock ? this.clock() : Date.now()).toISOString(),
      };
      recordPlacement(this.root(), placement);
      return { status: "written", path: path.relative(this.root(), abs) || destPath, key };
    } finally {
      /* value is local and dropped */
    }
  }

  async renderTemplate(templatePath: string, outputPath: string) {
    const absTemplate = resolveInsideWorkspace(this.workspaceRoots, path.resolve(this.root(), templatePath));
    const absOutput = resolveInsideWorkspace(this.workspaceRoots, path.resolve(this.root(), outputPath));
    if (absTemplate === absOutput) {
      throw new Error("Template and output paths must be different.");
    }
    if (await isGitTracked(absOutput, this.root())) {
      throw new Error("Refusing to write a secret into a git-tracked file.");
    }
    const templateText = fs.readFileSync(absTemplate, "utf8");
    assertTemplateSafe(templateText);
    const refs = findTemplateRefs(templateText);
    const session = await this.requireSession();
    const cache = new Map<string, string>();
    const akvRefs = refs.filter((raw) => parseRef(raw).scheme === "akv");
    if (akvRefs.length > 0 && !findPluginByScheme("akv")) {
      throw new Error("Template contains akv:// refs but the Azure Key Vault plugin is not installed.");
    }
    for (const raw of refs) {
      const parsed = parseRef(raw);
      if (parsed.scheme === "bw") {
        cache.set(raw, await resolveItemField(session, parsed.item, parsed.field));
      } else {
        const { getSecretValue } = await import("../../azure-key-vault/src/provider.ts");
        cache.set(raw, await getSecretValue(parsed.vault, parsed.secret, parsed.version));
      }
    }
    const rendered = renderTemplateText(templateText, (raw) => {
      const value = cache.get(raw);
      if (value == null) throw new Error("Missing resolved reference.");
      return value;
    });
    const finalOutput = rendered.output;
    atomicWriteFile(absOutput, finalOutput);
    addDestinationIgnores(this.root(), absOutput);
    recordPlacement(this.root(), {
      id: randomUUID(),
      ref: refs.join(","),
      destination: { kind: "template", templatePath: absTemplate, outputPath: absOutput },
      createdAt: new Date().toISOString(),
    });
    cache.clear();
    return { status: "written", path: path.relative(this.root(), absOutput) };
  }

  async copyToClipboard(ref: string, clearAfterSeconds = 30) {
    const { value } = await this.resolveRef(ref);
    const hashed = hashValue(value);
    await copyToClipboard(value);
    const seconds = Number.isFinite(clearAfterSeconds) ? clearAfterSeconds : 30;
    setTimeout(() => {
      void clearClipboardIfHash(hashed);
    }, Math.max(1, seconds) * 1000).unref?.();
    recordPlacement(this.root(), {
      id: randomUUID(),
      ref,
      destination: { kind: "clipboard", clearAfterSeconds: seconds },
      createdAt: new Date().toISOString(),
    });
    return { status: "copied", clearAfterSeconds: seconds };
  }

  async pipeToCommand(ref: string, argv: string[], cwd?: string) {
    const config = loadProjectConfig(this.root());
    if (!isAllowlisted(argv, config.pipe_allowlist)) {
      throw new Error("Command is not on the pipe allowlist.");
    }
    const { value } = await this.resolveRef(ref);
    const result = await pipeToCommand(argv, value, cwd || this.root());
    recordPlacement(this.root(), {
      id: randomUUID(),
      ref,
      destination: { kind: "pipe", argv },
      createdAt: new Date().toISOString(),
    });
    return { status: result.code === 0 ? "ok" : "failed", code: result.code, stdout: result.stdout, stderr: result.stderr };
  }

  listPlacements() {
    return { placements: loadPlacements(this.root()) };
  }

  async refreshPlacements() {
    const all = loadPlacements(this.root());
    let refreshed = 0;
    for (const placement of all) {
      if (placement.destination.kind === "dotenv") {
        await this.placeInDotenv(placement.ref, placement.destination.path, placement.destination.key);
        refreshed += 1;
      } else if (placement.destination.kind === "template") {
        await this.renderTemplate(placement.destination.templatePath, placement.destination.outputPath);
        refreshed += 1;
      }
    }
    return { status: "refreshed", count: refreshed };
  }

  removePlacement(id: string) {
    const ok = removePlacement(this.root(), id);
    return { status: ok ? "removed" : "not_found", id };
  }
}

