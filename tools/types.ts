import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root_dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type Source = "live" | "snapshot";

export type ToolContext = {
  mode: "live" | "snapshot";
  bom_snapshot?: string;
};

export type VerifyPostcodeResult = {
  valid: boolean;
  locality: string;
  state: string;
  source: Source;
};

export type WarningType = "severe_thunderstorm" | "hail" | "flood" | "none";

export type CheckBomWarningResult = {
  warning_found: boolean;
  warning_id: string | null;
  type: WarningType;
  issued_at: string;
  source: Source;
};

export type LookupPolicyResult = {
  found: boolean;
  policy_id: string | null;
  brand: string | null;
  address: string | null;
  postcode: string | null;
  covers: string[];
  excess: number | null;
  source: Source;
};

export type LodgeClaimResult = {
  claim_ref: string;
  status: "lodged" | "pending_manual_verification";
  source: Source;
};

export type ScheduleAssessmentResult = {
  booking_date: string;
  assessor_name: string;
  source: Source;
};

export type ReasonCode =
  | "not_covered"
  | "vulnerable_customer"
  | "claim_outcome_question"
  | "identity"
  | "complaint";

export type EscalateResult = {
  queue: string;
  sentence: string;
  reason_code: ReasonCode;
  source: Source;
};

export type Settings = {
  language: string;
  timezone: string;
  timeouts: { ftp_ms: number; http_ms: number };
  retry: { max_retries: number; backoff_ms: number };
  endpoints: {
    auspost_postcode_search: string;
    bom_ftp_host: string;
    bom_ftp_user: string;
    bom_ftp_password: string;
    bom_products: Record<string, string>;
  };
  snapshots: {
    auspost_dir: string;
    bom_dir: string;
    fixtures: string;
    hail_fixture: string;
    postcodes: string[];
  };
  queues: Record<ReasonCode, string>;
  escalate_sentences: Record<ReasonCode, string>;
  warning_text_types: string[];
  warning_keywords: Record<string, string[]>;
  warning_priority: WarningType[];
  relative_dates: string[];
  claim_ref_prefix: string;
  assessment: {
    assessor_name: string;
    windows: Record<string, string>;
  };
};

export type AgentConfig = {
  name: string;
  prompt_version: string;
  prompt_file: string;
  model: string;
  max_tokens: number;
  max_turns: number;
  skills: string[];
  demo_utterance: string;
};

export type PolicyFixture = {
  policy_id: string;
  brand: string;
  address: string;
  postcode: string;
  covers: string[];
  excess: number;
};

type Fixtures = { policies: Record<string, PolicyFixture> };

/** Load .env into the process when a key is not already set. */
export function load_dotenv(): void {
  const env_path = path.join(root_dir, ".env");
  if (!existsSync(env_path)) return;
  for (const line of readFileSync(env_path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

/** Read a JSON file from the package root. */
export function read_json<T>(relative_path: string): T {
  const full_path = path.join(root_dir, relative_path);
  return JSON.parse(readFileSync(full_path, "utf8")) as T;
}

/** Load tenant settings. Endpoints, timeouts, and queue names live here. */
export function load_settings(): Settings {
  return read_json<Settings>("config/settings.json");
}

/** Load the agent name, model, turn limit, and skill list. */
export function load_agent_config(): AgentConfig {
  return read_json<AgentConfig>("agent/agent.config.json");
}

/** Load policy fixtures used by lookup_policy. */
export function load_fixtures(): Fixtures {
  const settings = load_settings();
  return read_json<Fixtures>(settings.snapshots.fixtures);
}

/** Error text safe to log. */
export function error_message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a live call once, then retry once after the configured backoff.
 * Throws the last error so the caller can return a snapshot.
 */
export async function with_retry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const settings = load_settings();
  try {
    return await fn();
  } catch (error) {
    console.error(`${label}: ${error_message(error)}. Retrying once.`);
    await sleep(settings.retry.backoff_ms);
    try {
      return await fn();
    } catch (retry_error) {
      console.error(`${label}: retry failed: ${error_message(retry_error)}`);
      throw retry_error;
    }
  }
}
