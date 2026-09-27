# book_assessment

Book an assessor after a claim reference exists.

## Allowed tools

- schedule_assessment

## Rules

Call schedule_assessment only after lodge_claim returns a claim_ref.
Pass preferred_window as a configured window key, not a spoken phrase.
Read assessor_name and booking_date from the tool result. Do not invent them.
Skip this skill when you must escalate for vulnerability straight after the reference number.
