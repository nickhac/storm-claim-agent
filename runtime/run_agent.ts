import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { format_trace, type TraceCall } from "./activities.js";
import { dispatch_tool } from "./dispatch_tool.js";
import { load_agent_config, load_dotenv, load_settings, root_dir } from "../tools/types.js";

type ToolSpec = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool["input_schema"];
};

function tool_specs(): ToolSpec[] {
  const settings = load_settings();
  const states = Object.keys(settings.endpoints.bom_products);
  const windows = Object.keys(settings.assessment.windows);
  const warning_types = settings.warning_priority.filter((type) => type !== "none");
  return [
  {
    name: "verify_postcode",
    description: "Check that an Australian postcode is a real delivery area.",
    input_schema: {
      type: "object",
      properties: { postcode: { type: "string" } },
      required: ["postcode"],
    },
  },
  {
    name: "check_bom_warning",
    description: "Read the Bureau of Meteorology warning product for a state.",
    input_schema: {
      type: "object",
      properties: {
        state: { type: "string", enum: states },
        warning_types: {
          type: "array",
          items: { type: "string", enum: warning_types },
        },
      },
      required: ["state", "warning_types"],
    },
  },
  {
    name: "lookup_policy",
    description: "Read the fixture policy for a customer id.",
    input_schema: {
      type: "object",
      properties: { customer_id: { type: "string" } },
      required: ["customer_id"],
    },
  },
  {
    name: "lodge_claim",
    description: "Lodge a first notice. Pass bom_warning_id null when no warning was found.",
    input_schema: {
      type: "object",
      properties: {
        policy_id: { type: "string" },
        peril: { type: "string" },
        address: { type: "string" },
        bom_warning_id: { type: ["string", "null"] },
        event_date: { type: "string", description: "Explicit YYYY-MM-DD in the configured timezone." },
      },
      required: ["policy_id", "peril", "address", "bom_warning_id", "event_date"],
    },
  },
  {
    name: "schedule_assessment",
    description: "Book an assessor for a lodged claim.",
    input_schema: {
      type: "object",
      properties: {
        claim_ref: { type: "string" },
        preferred_window: { type: "string", enum: windows },
      },
      required: ["claim_ref", "preferred_window"],
    },
  },
  {
    name: "escalate",
    description: "Return the human queue and the sentence to say. No side effects.",
    input_schema: {
      type: "object",
      properties: {
        reason_code: {
          type: "string",
          enum: Object.keys(settings.queues),
        },
      },
      required: ["reason_code"],
    },
  },
];
}

function load_system_prompt(): string {
  const agent = load_agent_config();
  const settings = load_settings();
  const prompt_path = path.join(root_dir, "agent", agent.prompt_file);
  const prompt = readFileSync(prompt_path, "utf8").trim();
  const skills = agent.skills
    .map((skill) => readFileSync(path.join(root_dir, "skills", `${skill}.md`), "utf8").trim())
    .join("\n\n");
  const now = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const windows = Object.keys(settings.assessment.windows).join(", ");
  return [
    prompt,
    skills,
    `Runtime clock: ${now} in ${settings.timezone}. Language: ${settings.language}.`,
    `Allowed assessment windows: ${windows}.`,
  ].join("\n\n");
}

/** Run the live tool-use loop and print an Activities trace. */
async function run_agent(): Promise<void> {
  load_dotenv();
  const agent = load_agent_config();
  const utterance = process.argv[2] ?? agent.demo_utterance;
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: utterance }];
  const calls: TraceCall[] = [];
  let reply = "";

  for (let turn = 0; turn < agent.max_turns; turn += 1) {
    const response = await client.messages.create({
      model: agent.model,
      max_tokens: agent.max_tokens,
      system: load_system_prompt(),
      tools: tool_specs(),
      messages,
    });
    messages.push({ role: "assistant", content: response.content });
    const tool_uses = response.content.filter((block) => block.type === "tool_use");
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ")
      .trim();
    if (text) reply = text;
    if (tool_uses.length === 0) break;

    const tool_results: Anthropic.ToolResultBlockParam[] = [];
    for (const tool_use of tool_uses) {
      const args = (tool_use.input ?? {}) as Record<string, unknown>;
      const started = performance.now();
      let result: Record<string, unknown>;
      try {
        result = await dispatch_tool(tool_use.name, args, { mode: "live" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`run_agent: ${tool_use.name} failed: ${message}`);
        result = { error: message, source: "snapshot" };
      }
      const latency_ms = Math.round(performance.now() - started);
      calls.push({ tool: tool_use.name, arguments: args, result, latency_ms });
      tool_results.push({
        type: "tool_result",
        tool_use_id: tool_use.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: tool_results });
  }

  if (!reply) {
    console.error("run_agent: turn limit reached before a final reply");
    reply = "I need to stop here and have a specialist continue this claim.";
  }
  console.log(format_trace(calls, reply));
}

run_agent().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`run_agent: ${message}`);
  process.exit(1);
});
