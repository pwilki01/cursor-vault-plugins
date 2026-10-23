import { findTemplateRefs, parseRef } from "./refs.ts";

export function assertTemplateSafe(templateText: string): void {
  const refs = findTemplateRefs(templateText);
  if (refs.length === 0) {
    throw new Error("Template has no {{bw://...}} or {{akv://...}} placeholders.");
  }
  for (const ref of refs) parseRef(ref);
}

export function renderTemplateText(
  templateText: string,
  resolve: (ref: string) => string,
  allowedScheme?: "bw" | "akv",
): { output: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const output = templateText.replace(/\{\{\s*((?:bw|akv):\/\/[^}]+)\s*\}\}/g, (_full, raw: string) => {
    const ref = parseRef(raw.trim());
    if (allowedScheme && ref.scheme !== allowedScheme) {
      unresolved.push(raw.trim());
      return `{{${raw.trim()}}}`;
    }
    return resolve(raw.trim());
  });
  return { output, unresolved };
}
