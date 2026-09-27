# verify_event

Confirm the address is a real delivery area, then check the Bureau of Meteorology warning product for that state.

## Allowed tools

- verify_postcode
- check_bom_warning

## Rules

Call verify_postcode first. Pass the postcode exactly as the customer gave it.
Call check_bom_warning with the state from verify_postcode and the warning types that match the customer's description (hail, severe_thunderstorm, flood).
Do not invent a warning id or a locality.
