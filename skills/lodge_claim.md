# lodge_claim

Read the policy, then lodge the first notice when the peril is covered.

## Allowed tools

- lookup_policy
- lodge_claim

## Rules

Call lookup_policy with the customer id before lodge_claim.
If covers does not include the peril, do not call lodge_claim. Use the escalate skill with reason_code not_covered.
Pass an explicit event_date. Pass bom_warning_id from check_bom_warning, or null when warning_found is false.
Read the claim reference and status from the tool result. Do not invent them.
