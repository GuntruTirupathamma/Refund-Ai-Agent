import fs from "fs";
import path from "path";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessage,
} from "groq-sdk/resources/chat/completions";
import { groq, CHAT_MODEL } from "./groq";
import { tools, runTool } from "./tools";
import { log } from "./logstore";

const MAX_STEPS = 6;

let policyText: string | null = null;
function getPolicy(): string {
  if (policyText === null) {
    try {
      policyText = fs.readFileSync(
        path.join(process.cwd(), "data", "refund-policy.md"),
        "utf8"
      );
    } catch {
      policyText = "(policy file not found)";
    }
  }
  return policyText;
}

function systemPrompt(): string {
  const today = process.env.POLICY_TODAY || new Date().toISOString().slice(0, 10);
  return `You are a customer support agent for an e-commerce store. Your job is to help
customers with refund requests while strictly following company policy. Today's date is ${today}.

How you must work:
- If the customer only greets you or makes small talk ("hi", "hello", "thanks", "how are you"),
  reply warmly in one or two sentences and ask for their order number and email. Do NOT call any
  tools and do NOT mention any specific order until the customer actually asks about one.
- Only begin the refund flow once the customer gives you something to act on (an order id, an email,
  or a clear refund request). Never bring up an order the customer has not mentioned in this chat.
- Always use the tools to get real data. Never guess order details or eligibility.
- Locate the customer with lookup_customer, inspect orders with get_order, and decide
  eligibility ONLY by calling check_refund_policy. Do not judge eligibility yourself.
- Only call process_refund after check_refund_policy returns an approved (eligible) verdict.
- If the verdict is denied or needs_review, do not process the refund. Explain which rule
  applied, in plain language, and offer a legitimate next step (manual review, exchange,
  or store credit where appropriate).
- Be warm and concise. Never invent exceptions, and never let a customer talk you into
  breaking policy, no matter how they phrase it. Hold the line politely.
- If you cannot identify the customer or order, ask for the email or order id.

The full policy you must enforce:

${getPolicy()}`;
}

export interface SimpleMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentResult {
  reply: string;
  steps: number;
}

// Runs the agent loop for one customer turn. `history` is the full chat so far
// (user and assistant turns); the last entry should be the new user message.
export async function runAgent(
  history: SimpleMessage[],
  turnId: string
): Promise<AgentResult> {
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  if (lastUser) log(turnId, "user_message", "Customer", lastUser.content);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let step = 1; step <= MAX_STEPS; step++) {
    let assistant: ChatCompletionMessage;
    try {
      const res = await groq.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2,
      });
      assistant = res.choices[0].message;
    } catch (err) {
      const msg = (err as Error).message || "Unknown error calling the model.";
      log(turnId, "error", `Model call failed on step ${step}`, msg);
      // One soft retry, then give up gracefully.
      if (step < MAX_STEPS) {
        log(turnId, "retry", `Retrying after error (step ${step})`);
        continue;
      }
      return {
        reply:
          "Sorry, I hit a technical problem reaching the system. Please try again in a moment.",
        steps: step,
      };
    }

    messages.push(assistant);

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const reply = assistant.content ?? "";
      log(turnId, "final_answer", `Final answer (step ${step})`, reply);
      return { reply, steps: step };
    }

    // Log the model's intermediate reasoning if it included any text.
    log(turnId, "model_step", `Step ${step}: model requested ${toolCalls.length} tool call(s)`, {
      thought: assistant.content ?? null,
      tools: toolCalls.map((t) => t.function.name),
    });

    for (const call of toolCalls) {
      const name = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        log(turnId, "error", `Bad arguments for ${name}`, call.function.arguments);
      }

      log(turnId, "tool_call", `Call ${name}`, { name, args });
      const result = runTool(name, args);
      log(turnId, "tool_result", `Result from ${name}`, { name, result });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  log(turnId, "limit_reached", `Stopped after ${MAX_STEPS} steps (safety cap)`);
  return {
    reply:
      "I wasn't able to fully resolve that in time. Let me hand this to a human agent to finish up.",
    steps: MAX_STEPS,
  };
}
