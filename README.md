# stormclaim

First-notice agent for a storm, hail, or flood home claim. It checks the postcode, checks a Bureau of Meteorology warning, lodges against a policy fixture, and books an assessor or escalates.

## Business case

Each storm event generates 50,000 or more calls for Suncorp Group (AAMI, GIO, Suncorp Insurance). An agent takes first notice of loss in under 3 minutes, against 35 or more minutes on hold. The live BOM check reduces fraudulent and premature claims. Cost to start a claim falls from about $38 with a person to under $2 with the agent. A verified claim gets an assessor out sooner, which cuts temporary weatherproofing cost and customer churn.

## Use case

After a severe storm, a homeowner needs to lodge a claim for roof or property damage. They wait 30 to 45 minutes on the phone, then have to prove the storm happened, gather evidence, and book an assessor. One hail event sends tens of thousands of calls into the contact centre.

The customer says: "My roof was damaged last night in the storm. I need to make a claim."

1. `verify_postcode` checks the postcode with AusPost.
2. `check_bom_warning` reads the Bureau of Meteorology warning for the state and classifies hail, severe thunderstorm, or flood.
3. `lookup_policy` returns the policy, coverage type, and excess from a fixture.
4. `lodge_claim` lodges the peril and returns a claim reference. When a warning exists, the claim carries the warning id.
5. `schedule_assessment` books an assessor from a fixture, or the agent escalates.

The reply is the claim reference, the assessment date, the excess, and the next steps.

If BOM shows no active severe weather warning, the agent does not deny the claim. It flags the claim for manual verification and returns a queue reference.

| Component | Source | In this prototype |
| --- | --- | --- |
| Warning fetch, parse, and type | BOM anonymous FTP: QLD `IDQ10095.xml`, NSW `IDN10035.xml` | Live |
| Postcode validation | AusPost postcode search | Live |
| Policy lookup | Fixture: policy id, coverage, excess, address | Simulated |
| Claim lodgement | Fixture: claim reference, status lodged | Simulated |
| Assessor scheduling | Fixture: booking date, assessor name | Simulated |
| Customer authentication | Not implemented | Simulated |

Production needs the insurer claims system, identity verification, assessor dispatch, and a document upload link. The pattern is an enterprise insurance contact-centre agent for a post-event surge: a live public source makes the verification real, and the private system calls stay structured tool calls.

## Skills

| Skill | Tools | Data source | Must not do |
| --- | --- | --- | --- |
| verify_event | verify_postcode, check_bom_warning | Live AusPost and BOM FTP, snapshot fallback | Invent a locality or a warning |
| lodge_claim | lookup_policy, lodge_claim | Fixture | Lodge a peril the policy does not cover, or deny a claim when no warning exists |
| book_assessment | schedule_assessment | Fixture | Invent an assessor name or a booking date |
| escalate | escalate | Queue names and sentences in settings, no side effects | Promise approval, a payout, or a decision timeframe |

## Platform mapping

| Platform concept | In this repo |
| --- | --- |
| Skill | skills/*.md |
| Tool | tools/*.ts |
| Scenario | scenarios/*.json |
| Tags | tags/tags.json |
| Contextual Monitoring | monitoring/policies.json |
| Settings | config/settings.json |
| Activities trace | npm run demo output |

## Run

```bash
npm install
npm test
npm run snapshot
npm run demo
```

`npm test` runs `tests/run_scenarios.ts` against snapshots with scripted tool calls. No network and no API key. It exits non-zero on any failure.

`npm run snapshot` fetches live BOM XML and AusPost postcode responses and writes `snapshots/`. The hail fixture `snapshots/bom/QLD_hail.xml` is left in place.

`npm run demo` runs a live chat. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. Set `AUSPOST_API_KEY` when you have one. The demo reads `.env` if that file is present. The first line is the argument you pass, or the utterance in `agent/agent.config.json`. The session stays open. Type the next line at `you:`. Type `quit` to end.

The trace prints each tool call with arguments, source (`live` or `snapshot`), latency in milliseconds, the tags hit, and the final reply.

## Production path

Tools become platform Skills. Fixtures become connectors to the insurer's claims system and assessor scheduling. Identity verification, document upload, and voice stay on the platform. Deployment is single-tenant.
