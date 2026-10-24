import path from "node:path";

const escapeData = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProp = (s) => escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

export default async function* githubAnnotations(source) {
  for await (const event of source) {
    if (event.type !== "test:fail") continue;
    const { name, file, line, details } = event.data;
    const error = details?.error;
    const cause = error?.cause ?? error;
    const message = cause?.stack ?? cause?.message ?? String(cause ?? "failed");
    const props = [`title=${escapeProp(name)}`];
    if (file) props.push(`file=${escapeProp(path.relative(process.cwd(), file.replace(/^file:\/\//, "")))}`);
    if (line) props.push(`line=${line}`);
    yield `::error ${props.join(",")}::${escapeData(message.slice(0, 2000))}\n`;
  }
}
