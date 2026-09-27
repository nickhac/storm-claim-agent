import { load_fixtures, type LookupPolicyResult } from "./types.js";

/** Return the fixture policy for a customer id. */
export function lookup_policy(input: { customer_id: string }): LookupPolicyResult {
  const policy = load_fixtures().policies[input.customer_id];
  if (!policy) {
    console.error(`lookup_policy: no fixture for customer ${input.customer_id}`);
    return {
      found: false,
      policy_id: null,
      brand: null,
      address: null,
      postcode: null,
      covers: [],
      excess: null,
      source: "snapshot",
    };
  }
  return { found: true, ...policy, source: "snapshot" };
}
