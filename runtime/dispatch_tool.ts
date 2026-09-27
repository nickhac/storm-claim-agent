import { check_bom_warning } from "../tools/check_bom_warning.js";
import { escalate } from "../tools/escalate.js";
import { lodge_claim } from "../tools/lodge_claim.js";
import { lookup_policy } from "../tools/lookup_policy.js";
import { schedule_assessment } from "../tools/schedule_assessment.js";
import { verify_postcode } from "../tools/verify_postcode.js";
import type { ReasonCode, ToolContext } from "../tools/types.js";

/** Run one agent tool by name. */
export async function dispatch_tool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "verify_postcode":
      return verify_postcode({ postcode: String(args.postcode ?? "") }, ctx);
    case "check_bom_warning":
      return check_bom_warning(
        {
          state: String(args.state ?? ""),
          warning_types: as_string_list(args.warning_types),
        },
        ctx,
      );
    case "lookup_policy":
      return lookup_policy({ customer_id: String(args.customer_id ?? "") });
    case "lodge_claim":
      return lodge_claim({
        policy_id: String(args.policy_id ?? ""),
        peril: String(args.peril ?? ""),
        address: String(args.address ?? ""),
        bom_warning_id: args.bom_warning_id == null || args.bom_warning_id === ""
          ? null
          : String(args.bom_warning_id),
        event_date: String(args.event_date ?? ""),
      });
    case "schedule_assessment":
      return schedule_assessment({
        claim_ref: String(args.claim_ref ?? ""),
        preferred_window: String(args.preferred_window ?? ""),
      });
    case "escalate":
      return escalate({ reason_code: String(args.reason_code ?? "") as ReasonCode });
    default:
      console.error(`dispatch_tool: unknown tool ${name}`);
      throw new Error(`unknown tool ${name}`);
  }
}

function as_string_list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value) return [value];
  return [];
}
