import { load_settings, type EscalateResult, type ReasonCode } from "./types.js";

const reason_codes: ReasonCode[] = [
  "not_covered",
  "vulnerable_customer",
  "claim_outcome_question",
  "identity",
  "complaint",
];

/** Return the queue and the sentence the agent must say. No side effects. */
export function escalate(input: { reason_code: ReasonCode }): EscalateResult {
  if (!reason_codes.includes(input.reason_code)) {
    console.error(`escalate: unknown reason_code ${input.reason_code}`);
    throw new Error(`unknown reason_code ${input.reason_code}`);
  }
  const settings = load_settings();
  return {
    queue: settings.queues[input.reason_code],
    sentence: settings.escalate_sentences[input.reason_code],
    reason_code: input.reason_code,
    source: "snapshot",
  };
}
