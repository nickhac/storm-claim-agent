import { load_settings, type LodgeClaimResult } from "./types.js";

/** Lodge a fixture claim. A missing warning id flags manual verification. */
export function lodge_claim(input: {
  policy_id: string;
  peril: string;
  address: string;
  bom_warning_id: string | null;
  event_date: string;
}): LodgeClaimResult {
  const settings = load_settings();
  const normalised_date = input.event_date.trim().toLowerCase();
  if (settings.relative_dates.includes(normalised_date)) {
    console.error(`lodge_claim: event_date must be an explicit ISO date, got ${input.event_date}`);
    throw new Error(`event_date must be an explicit ISO date, got ${input.event_date}`);
  }
  const warning_id = input.bom_warning_id ? input.bom_warning_id : null;
  const status = warning_id ? "lodged" : "pending_manual_verification";
  const claim_ref = `${settings.claim_ref_prefix}-${input.policy_id}-${input.event_date}`;
  return { claim_ref, status, source: "snapshot" };
}
