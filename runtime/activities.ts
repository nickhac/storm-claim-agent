import { read_json } from "../tools/types.js";

export type TraceCall = {
  tool: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
  latency_ms: number;
};

type TagRule = {
  tag: string;
  tool: string;
  result_field?: string;
  argument_field?: string;
  equals?: string;
};

type MonitoringPolicy = {
  id: string;
  kind: "must_escalate" | "forbidden_phrases";
  reason_code?: string;
  phrases?: string[];
};

/** Derive outcome tags from the tool trace using tags/tags.json. */
export function apply_tags(calls: TraceCall[]): string[] {
  const rules = read_json<{ rules: TagRule[] }>("tags/tags.json").rules;
  const tags: string[] = [];
  for (const rule of rules) {
    const hit = calls.some((call) => {
      if (call.tool !== rule.tool) return false;
      if (rule.result_field) return call.result[rule.result_field] === rule.equals;
      if (rule.argument_field) return call.arguments[rule.argument_field] === rule.equals;
      return true;
    });
    if (hit) tags.push(rule.tag);
  }
  return tags;
}

/** Phrases in the reply that the promise_of_approval policy forbids. */
export function promise_violations(reply: string): string[] {
  const policies = read_json<{ policies: MonitoringPolicy[] }>("monitoring/policies.json").policies;
  const policy = policies.find((item) => item.id === "promise_of_approval");
  const phrases = policy?.phrases ?? [];
  const haystack = reply.toLowerCase();
  return phrases.filter((phrase) => haystack.includes(phrase.toLowerCase()));
}

/** True when the vulnerable_customer policy sees the matching escalation. */
export function monitoring_fired(policy_id: string, calls: TraceCall[]): boolean {
  const policies = read_json<{ policies: MonitoringPolicy[] }>("monitoring/policies.json").policies;
  const policy = policies.find((item) => item.id === policy_id);
  if (!policy || policy.kind !== "must_escalate" || !policy.reason_code) return false;
  return calls.some(
    (call) => call.tool === "escalate" && call.arguments.reason_code === policy.reason_code,
  );
}

/** Spoken reply from tool results. Two short sentences, then one question. */
export function compose_reply(calls: TraceCall[]): string {
  if (calls.length === 0) {
    return "I help with storm claim lodgement only. Tell me the postcode and your customer number.";
  }
  const postcode = calls.find((call) => call.tool === "verify_postcode");
  const claim = calls.find((call) => call.tool === "lodge_claim");
  const booking = calls.find((call) => call.tool === "schedule_assessment");
  const policy = calls.find((call) => call.tool === "lookup_policy");
  const escalation = calls.find((call) => call.tool === "escalate");

  if (postcode && postcode.result.valid === false) {
    return `Postcode ${String(postcode.arguments.postcode)} is not a known delivery area. Please confirm the address and postcode of the property.`;
  }
  if (escalation?.arguments.reason_code === "not_covered") {
    return `${String(escalation.result.sentence)} Nothing has been lodged on this call. Shall I connect you now?`;
  }
  if (escalation?.arguments.reason_code === "claim_outcome_question" && !claim) {
    return `${String(escalation.result.sentence)} I will arrange the transfer. Shall I connect you now?`;
  }
  if (claim && escalation?.arguments.reason_code === "vulnerable_customer") {
    return `Your claim reference is ${String(claim.result.claim_ref)}. ${String(escalation.result.sentence)} Shall I stay on the line while I connect you?`;
  }
  if (claim && claim.result.status === "pending_manual_verification") {
    const address = String(claim.arguments.address ?? "");
    return `Your claim ${String(claim.result.claim_ref)} is lodged and flagged for manual verification. A specialist will review the weather records for this address. Is ${address} the damaged property?`;
  }
  if (claim && booking) {
    const excess = policy?.result.excess;
    const excess_sentence = typeof excess === "number" ? ` The excess on this policy is $${excess}.` : "";
    return `Your claim ${String(claim.result.claim_ref)} is lodged, and ${String(booking.result.assessor_name)} is booked for ${String(booking.result.booking_date)}.${excess_sentence} Does that booking date work for you?`;
  }
  if (escalation) {
    return `${String(escalation.result.sentence)} Shall I connect you now?`;
  }
  return "Tell me the postcode and your customer number so I can lodge the claim. Is the damage at the insured address?";
}

/** Activities-style lines for a finished trace. */
export function format_trace(calls: TraceCall[], reply: string): string {
  const lines = calls.map((call) => {
    const source = String(call.result.source ?? "snapshot");
    return `activity tool=${call.tool} args=${JSON.stringify(call.arguments)} source=${source} latency_ms=${call.latency_ms}`;
  });
  lines.push(`tags: ${apply_tags(calls).join(", ")}`);
  lines.push(`reply: ${reply}`);
  return lines.join("\n");
}
