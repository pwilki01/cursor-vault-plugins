export type BwField = "password" | "username" | "totp" | "notes" | `field:${string}`;

export type BwRef = {
  scheme: "bw";
  item: string;
  field: BwField;
};

export type AkvRef = {
  scheme: "akv";
  vault: string;
  secret: string;
  version?: string;
};

export type SecretRef = BwRef | AkvRef;

const BW_RE = /^bw:\/\/([^/]+)(?:\/(.+))?$/i;
const AKV_RE = /^akv:\/\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/i;

export function parseRef(input: string): SecretRef {
  const trimmed = input.trim();
  const bw = trimmed.match(BW_RE);
  if (bw) {
    const fieldRaw = bw[2] ?? "password";
    const field = normalizeBwField(fieldRaw);
    return { scheme: "bw", item: decodeURIComponent(bw[1]), field };
  }
  const akv = trimmed.match(AKV_RE);
  if (akv) {
    return {
      scheme: "akv",
      vault: decodeURIComponent(akv[1]),
      secret: decodeURIComponent(akv[2]),
      version: akv[3] ? decodeURIComponent(akv[3]) : undefined,
    };
  }
  throw new Error("Unrecognized secret reference. Use bw://<item>[/<field>] or akv://<vault>/<secret>[/<version>].");
}

function normalizeBwField(field: string): BwField {
  const lower = field.toLowerCase();
  if (lower === "password" || lower === "username" || lower === "totp" || lower === "notes") {
    return lower;
  }
  if (lower.startsWith("field:")) {
    return `field:${field.slice("field:".length)}`;
  }
  throw new Error("Unsupported Bitwarden field. Use password, username, totp, notes, or field:<name>.");
}

export function formatRef(ref: SecretRef): string {
  if (ref.scheme === "bw") {
    return `bw://${encodeURIComponent(ref.item)}/${ref.field}`;
  }
  return ref.version
    ? `akv://${encodeURIComponent(ref.vault)}/${encodeURIComponent(ref.secret)}/${encodeURIComponent(ref.version)}`
    : `akv://${encodeURIComponent(ref.vault)}/${encodeURIComponent(ref.secret)}`;
}

export function findTemplateRefs(text: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*((?:bw|akv):\/\/[^}]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    out.push(match[1].trim());
  }
  return out;
}
