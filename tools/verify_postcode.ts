import { readFileSync } from "node:fs";
import path from "node:path";
import {
  error_message,
  load_settings,
  root_dir,
  with_retry,
  type ToolContext,
  type VerifyPostcodeResult,
} from "./types.js";

type Locality = { location?: string; state?: string; postcode?: string };

/** Validate a postcode with AusPost. On live failure, return the snapshot. */
export async function verify_postcode(
  input: { postcode: string },
  ctx: ToolContext = { mode: "live" },
): Promise<VerifyPostcodeResult> {
  if (ctx.mode === "snapshot") return read_postcode_snapshot(input.postcode);
  try {
    const raw = await with_retry("verify_postcode", () => download_postcode(input.postcode));
    return { ...parse_postcode_payload(raw), source: "live" };
  } catch (error) {
    console.error(
      `verify_postcode: live lookup failed for ${input.postcode}, returning snapshot: ${error_message(error)}`,
    );
    return read_postcode_snapshot(input.postcode);
  }
}

/** Fetch the AusPost postcode search payload. */
export async function download_postcode(postcode: string): Promise<unknown> {
  const settings = load_settings();
  const url = new URL(settings.endpoints.auspost_postcode_search);
  url.searchParams.set("q", postcode);
  const headers: Record<string, string> = {};
  const api_key = process.env.AUSPOST_API_KEY;
  if (api_key) headers["AUTH-KEY"] = api_key;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(settings.timeouts.http_ms),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from postcode search`);
  return response.json() as Promise<unknown>;
}

function read_postcode_snapshot(postcode: string): VerifyPostcodeResult {
  const settings = load_settings();
  const file_path = path.join(root_dir, settings.snapshots.auspost_dir, `${postcode}.json`);
  try {
    const raw = JSON.parse(readFileSync(file_path, "utf8")) as unknown;
    return { ...parse_postcode_payload(raw), source: "snapshot" };
  } catch (error) {
    console.error(`verify_postcode: snapshot missing for ${postcode}: ${error_message(error)}`);
    return { valid: false, locality: "", state: "", source: "snapshot" };
  }
}

/** Map an AusPost localities payload to a postcode result. */
export function parse_postcode_payload(raw: unknown): Omit<VerifyPostcodeResult, "source"> {
  const localities = (raw as { localities?: unknown } | null)?.localities;
  if (!localities || typeof localities !== "object") {
    return { valid: false, locality: "", state: "" };
  }
  const locality_field = (localities as { locality?: Locality | Locality[] }).locality;
  const locality = Array.isArray(locality_field) ? locality_field[0] : locality_field;
  if (!locality?.location || !locality.state) {
    return { valid: false, locality: "", state: "" };
  }
  return { valid: true, locality: locality.location, state: locality.state };
}
