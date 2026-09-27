import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { compose_reply, apply_tags, monitoring_fired, promise_violations, type TraceCall } from "../runtime/activities.js";
import { dispatch_tool } from "../runtime/dispatch_tool.js";
import { root_dir } from "../tools/types.js";

type ScenarioCall = {
  tool: string;
  arguments: Record<string, unknown>;
  required_arguments?: Record<string, unknown>;
  expect_result?: Record<string, unknown>;
};

type Scenario = {
  id: string;
  user_turns: string[];
  bom_snapshot?: string;
  expected_tools: string[];
  calls: ScenarioCall[];
  forbidden_tools: string[];
  forbidden_strings: string[];
  required_strings: string[];
  expected_tags: string[];
  monitoring_must_fire: string[];
};

function same_members(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sorted_left = [...left].sort();
  const sorted_right = [...right].sort();
  return sorted_left.every((value, index) => value === sorted_right[index]);
}

function matches(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return actual === expected;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.length === actual.length && expected.every((value, index) => matches(actual[index], value));
  }
  if (!actual || typeof actual !== "object") return false;
  const record = actual as Record<string, unknown>;
  return Object.entries(expected as Record<string, unknown>).every(([key, value]) => matches(record[key], value));
}

function resolve_value(value: unknown, results: Map<string, Record<string, unknown>>): unknown {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  const [tool, field] = value.slice(1).split(".");
  return results.get(tool)?.[field];
}

function resolve_args(
  args: Record<string, unknown>,
  results: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) resolved[key] = resolve_value(value, results);
  return resolved;
}

async function run_scenario(scenario: Scenario): Promise<string[]> {
  const failures: string[] = [];
  const results = new Map<string, Record<string, unknown>>();
  const calls: TraceCall[] = [];
  const tool_names = scenario.calls.map((call) => call.tool);

  if (!same_members(tool_names, scenario.expected_tools) || tool_names.join("|") !== scenario.expected_tools.join("|")) {
    failures.push(`tool sequence ${tool_names.join(", ")} != ${scenario.expected_tools.join(", ")}`);
  }
  for (const forbidden of scenario.forbidden_tools) {
    if (tool_names.includes(forbidden)) failures.push(`forbidden tool called: ${forbidden}`);
  }

  for (const call of scenario.calls) {
    const args = resolve_args(call.arguments, results);
    if (call.required_arguments && !matches(args, call.required_arguments)) {
      failures.push(`${call.tool} arguments ${JSON.stringify(args)} missing ${JSON.stringify(call.required_arguments)}`);
    }
    const started = performance.now();
    const result = await dispatch_tool(call.tool, args, {
      mode: "snapshot",
      bom_snapshot: scenario.bom_snapshot,
    });
    calls.push({
      tool: call.tool,
      arguments: args,
      result,
      latency_ms: Math.round(performance.now() - started),
    });
    results.set(call.tool, result);
    if (call.expect_result && !matches(result, call.expect_result)) {
      failures.push(`${call.tool} result ${JSON.stringify(result)} missing ${JSON.stringify(call.expect_result)}`);
    }
  }

  const reply = compose_reply(calls);
  const tags = apply_tags(calls);
  if (!same_members(tags, scenario.expected_tags)) {
    failures.push(`tags ${tags.join(", ")} != ${scenario.expected_tags.join(", ")}`);
  }
  const haystack = reply.toLowerCase();
  for (const forbidden of scenario.forbidden_strings) {
    if (haystack.includes(forbidden.toLowerCase())) failures.push(`reply contains forbidden string: ${forbidden}`);
  }
  for (const required of scenario.required_strings) {
    if (!haystack.includes(required.toLowerCase())) failures.push(`reply missing required string: ${required}`);
  }
  const violations = promise_violations(reply);
  if (violations.length > 0) failures.push(`promise_of_approval matched: ${violations.join(", ")}`);
  for (const policy_id of scenario.monitoring_must_fire) {
    if (!monitoring_fired(policy_id, calls)) failures.push(`monitoring policy did not fire: ${policy_id}`);
  }
  const claim = calls.find((call) => call.tool === "lodge_claim");
  if (claim && !reply.includes(String(claim.result.claim_ref))) {
    failures.push("reply omitted the claim reference");
  }
  const escalation = calls.find((call) => call.tool === "escalate");
  if (escalation && !reply.includes(String(escalation.result.sentence))) {
    failures.push("reply omitted the escalation sentence");
  }
  if (scenario.user_turns.length === 0) failures.push("scenario has no user turns");
  return failures;
}

async function main(): Promise<void> {
  const dir = path.join(root_dir, "scenarios");
  const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
  let failed = 0;
  for (const file of files) {
    const scenario = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Scenario;
    try {
      const failures = await run_scenario(scenario);
      if (failures.length === 0) {
        console.log(`PASS ${scenario.id}`);
      } else {
        failed += 1;
        console.error(`FAIL ${scenario.id}`);
        for (const failure of failures) console.error(`  ${failure}`);
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL ${scenario.id}`);
      console.error(`  ${message}`);
    }
  }
  console.log(`${files.length} scenarios, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`run_scenarios: ${message}`);
  process.exit(1);
});
