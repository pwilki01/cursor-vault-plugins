export function upsertDotenv(contents: string, key: string, value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error("Environment variable name must be a POSIX identifier.");
  }
  const quoted = quoteDotenvValue(value);
  const line = `${key}=${quoted}`;
  const lines = contents.length === 0 ? [] : contents.split(/\n/);
  let replaced = false;
  const next = lines.map((existing) => {
    const trimmed = existing.trim();
    if (trimmed.startsWith("#") || trimmed === "") return existing;
    const eq = existing.indexOf("=");
    if (eq === -1) return existing;
    const name = existing.slice(0, eq).trim();
    if (name !== key) return existing;
    replaced = true;
    const indent = existing.match(/^\s*/)?.[0] ?? "";
    return `${indent}${line}`;
  });
  if (!replaced) {
    if (next.length > 0 && next[next.length - 1] === "") {
      next[next.length - 1] = line;
      next.push("");
    } else {
      next.push(line);
    }
  }
  return next.join("\n");
}

function quoteDotenvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value) && !value.includes(" ")) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}
