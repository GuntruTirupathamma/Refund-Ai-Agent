// Pure helpers that translate raw agent events into human-readable timeline
// steps and a final decision. No JSX here so both the console and the activity
// history page can share this logic. The admin never sees raw logs.

export type Tone = "neutral" | "success" | "error" | "warning" | "info";

export interface UIEvent {
  id: string;
  turnId: string;
  ts: number;
  type: string;
  label: string;
  detail?: any;
}

export interface TimelineStep {
  id: string;
  ts: number;
  title: string;
  description: string;
  tone: Tone;
  status: "active" | "done";
  tool?: string; // technical tool name, e.g. CRM_LOOKUP
  outcome?: string; // SUCCESS, DENIED, NEEDS REVIEW, RUNNING, ...
}

export type DecisionKind = "approved" | "denied" | "needs_review";

export interface Decision {
  kind: DecisionKind;
  title: string;
  tone: Tone;
  orderId: string;
  reason: string;
  ruleCode: string;
  ruleName: string;
  amount?: number;
  confirmation?: string;
}

export function ruleName(code: string): string {
  const map: Record<string, string> = {
    R1: "Outside 30-day return window",
    R2: "Final sale item",
    R3: "Digital goods already accessed",
    R4: "Opened electronics not eligible",
    R5: "Refund abuse review",
    R6: "High-value manager approval",
    R7: "Order already refunded",
    R8: "Order not yet delivered",
    OK: "Meets all policy rules",
    VIP: "Platinum VIP extended window",
  };
  return map[code] ?? code;
}

function decisionMeta(kind: DecisionKind): { title: string; tone: Tone } {
  switch (kind) {
    case "approved":
      return { title: "Refund approved", tone: "success" };
    case "denied":
      return { title: "Refund denied", tone: "error" };
    case "needs_review":
      return { title: "Manual review required", tone: "warning" };
  }
}

// Read tool_result events of a given tool name.
function toolResults(events: UIEvent[], name: string): any[] {
  return events
    .filter((e) => e.type === "tool_result" && e.detail?.name === name)
    .map((e) => e.detail?.result);
}

const PENDING_TITLE: Record<string, string> = {
  lookup_customer: "Looking up customer…",
  get_order: "Retrieving order…",
  check_refund_policy: "Checking refund policy…",
  process_refund: "Processing refund…",
};

// Technical tool names shown as chips so the trace reads as tool executions.
const TOOL_LABEL: Record<string, string> = {
  lookup_customer: "CRM_LOOKUP",
  get_order: "ORDER_LOOKUP",
  check_refund_policy: "POLICY_ENGINE",
  process_refund: "REFUND_PROCESSOR",
};

interface Resolved {
  title: string;
  description: string;
  tone: Tone;
  tool: string;
  outcome: string;
}

// Builds the resolved (done) step for a finished tool call.
function resolveStep(name: string, r: any): Resolved {
  const tool = TOOL_LABEL[name] ?? name.toUpperCase();
  if (name === "lookup_customer") {
    return r.found
      ? {
          tool,
          outcome: "SUCCESS",
          title: "Customer found",
          description: `${r.name} · ${r.loyalty_tier ?? "standard"} tier · ${r.refunds_last_12_months ?? 0} prior refunds`,
          tone: "success",
        }
      : { tool, outcome: "NOT FOUND", title: "Customer not found", description: "No matching customer on record.", tone: "warning" };
  }
  if (name === "get_order") {
    return r.found
      ? {
          tool,
          outcome: "SUCCESS",
          title: "Order retrieved",
          description: `${r.item} · $${Number(r.amount).toFixed(2)} · ${String(r.delivery_status).replace("_", " ")}`,
          tone: "success",
        }
      : { tool, outcome: "NOT FOUND", title: "Order not found", description: "That order id could not be located.", tone: "warning" };
  }
  if (name === "check_refund_policy") {
    if (!r.found) return { tool, outcome: "ERROR", title: "Policy check failed", description: "Order could not be evaluated.", tone: "warning" };
    if (r.decision === "approved")
      return { tool, outcome: "APPROVED", title: "Policy validated", description: "Eligible · all rules passed", tone: "success" };
    if (r.decision === "denied")
      return { tool, outcome: "DENIED", title: "Policy validated", description: `${r.rule} · ${ruleName(r.rule)}`, tone: "error" };
    return { tool, outcome: "NEEDS REVIEW", title: "Policy validated", description: `${r.rule} · ${ruleName(r.rule)}`, tone: "warning" };
  }
  if (name === "process_refund") {
    if (r.success)
      return {
        tool,
        outcome: "SUCCESS",
        title: "Refund processed",
        description: `Confirmation ${r.confirmation_number} · $${Number(r.refunded_amount).toFixed(2)} returned`,
        tone: "success",
      };
    if (r.blocked_by_policy)
      return { tool, outcome: "BLOCKED", title: "Refund withheld", description: "Payout blocked by policy. No money moved.", tone: "error" };
    return { tool, outcome: "NO ACTION", title: "Refund not processed", description: r.message ?? "No action taken.", tone: "warning" };
  }
  return { tool, outcome: "DONE", title: name, description: "Done.", tone: "neutral" };
}

// Translates raw events into timeline steps. Each tool call appears as a live
// "in progress" step the moment the agent starts it, then resolves in place to
// its result, so the policy check is visible as it happens.
export function buildTimeline(events: UIEvent[]): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const pending: Record<string, number[]> = {};

  for (const e of events) {
    if (e.type === "user_message") {
      steps.push({
        id: e.id,
        ts: e.ts,
        title: "Request received",
        description: "Customer submitted a refund request.",
        tone: "info",
        status: "done",
      });
    } else if (e.type === "tool_call") {
      const name = e.detail?.name;
      if (!name) continue;
      steps.push({
        id: e.id,
        ts: e.ts,
        title: PENDING_TITLE[name] ?? "Working…",
        description: "In progress",
        tone: "neutral",
        status: "active",
        tool: TOOL_LABEL[name] ?? name.toUpperCase(),
        outcome: "RUNNING",
      });
      (pending[name] ||= []).push(steps.length - 1);
    } else if (e.type === "tool_result") {
      const name = e.detail?.name;
      if (!name) continue;
      const resolved = resolveStep(name, e.detail?.result ?? {});
      const stack = pending[name];
      if (stack && stack.length) {
        const idx = stack.pop()!;
        steps[idx] = { ...steps[idx], ...resolved, status: "done" };
      } else {
        steps.push({ id: e.id, ts: e.ts, ...resolved, status: "done" });
      }
    } else if (e.type === "final_answer") {
      steps.push({
        id: e.id,
        ts: e.ts,
        title: "Decision delivered",
        description: "Response sent to the customer.",
        tone: "info",
        status: "done",
      });
    } else if (e.type === "limit_reached") {
      steps.push({
        id: e.id,
        ts: e.ts,
        title: "Escalated",
        description: "Handed to a human agent after the step limit.",
        tone: "warning",
        status: "done",
      });
    } else if (e.type === "error") {
      steps.push({
        id: e.id,
        ts: e.ts,
        title: "Recovered from an error",
        description: "The agent retried after a system hiccup.",
        tone: "warning",
        status: "done",
      });
    }
  }

  return steps;
}

export function extractDecision(events: UIEvent[]): Decision | null {
  const policy = toolResults(events, "check_refund_policy").filter((r) => r?.found);
  const refunds = toolResults(events, "process_refund");
  const success = refunds.find((r) => r?.success);
  const blocked = refunds.find((r) => r?.blocked_by_policy);

  // Prefer the policy verdict. Fall back to the refund result so a decision
  // card still appears even when the agent skipped the policy tool (for
  // example, an already-refunded order it processed directly).
  let kind: DecisionKind;
  let orderId: string;
  let reason: string;
  let ruleCode: string;
  let amount: number | undefined;

  if (policy.length > 0) {
    const last = policy[policy.length - 1];
    kind = last.decision as DecisionKind;
    orderId = last.order_id;
    reason = last.reason;
    ruleCode = last.rule;
    amount = last.refund_amount;
  } else if (success) {
    kind = "approved";
    orderId = success.order_id;
    reason = "Order is eligible for a refund.";
    ruleCode = "OK";
    amount = success.refunded_amount;
  } else if (blocked) {
    kind = "denied";
    orderId = blocked.order_id ?? "";
    reason = blocked.reason ?? "Blocked by policy.";
    ruleCode = blocked.rule ?? "";
    amount = undefined;
  } else {
    return null;
  }

  const meta = decisionMeta(kind);
  return {
    kind,
    title: meta.title,
    tone: meta.tone,
    orderId,
    reason,
    ruleCode,
    ruleName: ruleName(ruleCode),
    amount,
    confirmation: success?.confirmation_number,
  };
}
