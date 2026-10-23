import { Buffer } from "node:buffer";

const MASK = "********";

export function encodingsOf(secret: string): string[] {
  if (!secret) return [];
  const values = new Set<string>([secret]);
  try {
    values.add(encodeURIComponent(secret));
  } catch {
    /* ignore */
  }
  values.add(Buffer.from(secret, "utf8").toString("base64"));
  return [...values].filter((v) => v.length > 0);
}

export function maskText(text: string, secrets: string[]): string {
  let out = text;
  const needles = secrets.flatMap(encodingsOf).sort((a, b) => b.length - a.length);
  for (const needle of needles) {
    if (!needle) continue;
    out = out.split(needle).join(MASK);
  }
  return out;
}

export class StreamMasker {
  private carry = "";
  private readonly maxCarry: number;
  private readonly secrets: string[];

  constructor(secrets: string[]) {
    this.secrets = secrets;
    this.maxCarry = Math.max(64, ...encodingsOf(secrets.join("")).map((s) => s.length), ...secrets.map((s) => s.length));
  }

  push(chunk: string): string {
    const combined = this.carry + chunk;
    if (combined.length <= this.maxCarry) {
      this.carry = combined;
      return "";
    }
    const emitCount = combined.length - this.maxCarry;
    const emit = combined.slice(0, emitCount);
    this.carry = combined.slice(emitCount);
    return maskText(emit, this.secrets);
  }

  flush(): string {
    const rest = maskText(this.carry, this.secrets);
    this.carry = "";
    return rest;
  }
}

export function safeErrorMessage(err: unknown, secrets: string[] = []): string {
  const raw = err instanceof Error ? err.message : String(err);
  return maskText(raw, secrets);
}
