type LogEvent = Record<string, string | number | boolean | null | undefined>;

const FORBIDDEN = /password|secret|token|totp|notes|session|value|canary/i;

export function sanitizeEvent(event: LogEvent): LogEvent {
  const out: LogEvent = {};
  for (const [key, value] of Object.entries(event)) {
    if (FORBIDDEN.test(key)) continue;
    if (typeof value === "string" && value.length > 500) {
      out[key] = `${value.slice(0, 80)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function logEvent(event: LogEvent): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...sanitizeEvent(event) });
  process.stderr.write(`${line}\n`);
}
