import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "basic-ftp";
import { XMLParser } from "fast-xml-parser";
import { Writable } from "node:stream";
import {
  error_message,
  load_settings,
  root_dir,
  with_retry,
  type CheckBomWarningResult,
  type ToolContext,
  type WarningType,
} from "./types.js";

type WarningText = { type: string; id: string | null; text: string };

/** Check a BOM warning product. On live failure, return the snapshot. */
export async function check_bom_warning(
  input: { state: string; warning_types: string[] },
  ctx: ToolContext = { mode: "live" },
): Promise<CheckBomWarningResult> {
  if (ctx.mode === "snapshot") return read_bom_snapshot(input, ctx.bom_snapshot);
  try {
    const xml = await with_retry("check_bom_warning", () => download_bom_xml(input.state));
    return { ...parse_bom_xml(xml, input.warning_types), source: "live" };
  } catch (error) {
    console.error(
      `check_bom_warning: live fetch failed for ${input.state}, returning snapshot: ${error_message(error)}`,
    );
    return read_bom_snapshot(input, ctx.bom_snapshot);
  }
}

/** Download one BOM warning product over anonymous FTP. */
export async function download_bom_xml(state: string): Promise<string> {
  const settings = load_settings();
  const remote_path = settings.endpoints.bom_products[state];
  if (!remote_path) throw new Error(`No BOM product configured for ${state}`);
  const client = new Client(settings.timeouts.ftp_ms);
  try {
    await client.access({
      host: settings.endpoints.bom_ftp_host,
      user: settings.endpoints.bom_ftp_user,
      password: settings.endpoints.bom_ftp_password,
      secure: false,
    });
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    });
    await client.downloadTo(sink, remote_path);
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    client.close();
  }
}

function read_bom_snapshot(
  input: { state: string; warning_types: string[] },
  bom_snapshot?: string,
): CheckBomWarningResult {
  const settings = load_settings();
  const file_name = bom_snapshot ?? `${input.state}.xml`;
  const file_path = path.join(root_dir, settings.snapshots.bom_dir, file_name);
  try {
    const xml = readFileSync(file_path, "utf8");
    return { ...parse_bom_xml(xml, input.warning_types), source: "snapshot" };
  } catch (error) {
    console.error(`check_bom_warning: snapshot missing for ${file_name}: ${error_message(error)}`);
    return {
      warning_found: false,
      warning_id: null,
      type: "none",
      issued_at: "",
      source: "snapshot",
    };
  }
}

/** Classify warning text in a BOM product XML document. */
export function parse_bom_xml(
  xml: string,
  warning_types: string[],
): Omit<CheckBomWarningResult, "source"> {
  const settings = load_settings();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
  });
  const doc = parser.parse(xml) as unknown;
  const issued_at = find_issued_at(doc);
  const identifier = find_text_key(doc, "identifier");
  const texts = collect_warning_texts(doc).filter((item) =>
    settings.warning_text_types.includes(item.type),
  );
  const requested = warning_types.filter((type) => type !== "none");
  const search_order = requested.length > 0 ? requested : settings.warning_priority;
  for (const type of search_order) {
    const keywords = settings.warning_keywords[type] ?? [];
    const match = texts.find((item) => keywords.some((word) => item.text.toLowerCase().includes(word)));
    if (match && is_warning_type(type)) {
      const warning_id = match.id ?? (identifier ? `${identifier}-${type}` : type);
      return { warning_found: true, warning_id, type, issued_at };
    }
  }
  return { warning_found: false, warning_id: null, type: "none", issued_at };
}

function is_warning_type(value: string): value is Exclude<WarningType, "none"> {
  return value === "hail" || value === "severe_thunderstorm" || value === "flood";
}

function collect_warning_texts(node: unknown, found: WarningText[] = []): WarningText[] {
  if (Array.isArray(node)) {
    for (const item of node) collect_warning_texts(item, found);
    return found;
  }
  if (!node || typeof node !== "object") return found;
  const record = node as Record<string, unknown>;
  if (typeof record["@_type"] === "string") {
    found.push({
      type: record["@_type"],
      id: typeof record["@_id"] === "string" ? record["@_id"] : null,
      text: text_of(record),
    });
  }
  for (const value of Object.values(record)) collect_warning_texts(value, found);
  return found;
}

function text_of(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  if ("#text" in node) return String((node as { "#text": unknown })["#text"] ?? "");
  return "";
}

function find_issued_at(node: unknown): string {
  const local = find_node_key(node, "issue-time-local");
  const local_text = text_of(local);
  if (local_text) return local_text;
  const utc = find_node_key(node, "issue-time-utc");
  return text_of(utc);
}

function find_text_key(node: unknown, key: string): string | null {
  const found = find_node_key(node, key);
  const text = text_of(found);
  return text || null;
}

function find_node_key(node: unknown, key: string): unknown {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = find_node_key(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!node || typeof node !== "object") return undefined;
  const record = node as Record<string, unknown>;
  if (key in record) return record[key];
  for (const value of Object.values(record)) {
    const found = find_node_key(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}
