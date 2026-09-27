# escalate

Hand the call to a human queue. This tool has no side effects. Say the returned sentence.

## Allowed tools

- escalate

## Rules

reason_code is one of: not_covered, vulnerable_customer, claim_outcome_question, identity, complaint.
Say the sentence from the tool result. Do not add an approval, a payout, or a decision timeframe.
For vulnerable_customer, call this straight after you have given the claim reference.
