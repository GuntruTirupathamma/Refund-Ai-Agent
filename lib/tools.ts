import crmData from "../data/crm.json";
import { Customer, Order, evaluatePolicy } from "./policy";

// Work on a mutable copy so process_refund can flip an order's status during a
// session. Stored on globalThis so the state survives dev hot reloads.
const g = globalThis as unknown as { __crm?: Customer[] };
if (!g.__crm) {
  g.__crm = JSON.parse(JSON.stringify(crmData)) as Customer[];
}
const crm: Customer[] = g.__crm;

function policyToday(): string {
  return process.env.POLICY_TODAY || new Date().toISOString().slice(0, 10);
}

function findCustomerByOrder(orderId: string): { customer: Customer; order: Order } | null {
  for (const c of crm) {
    const order = c.orders.find((o) => o.order_id === orderId);
    if (order) return { customer: c, order };
  }
  return null;
}

// ---- Tool implementations -------------------------------------------------

function lookup_customer(args: { email?: string; customer_id?: string }) {
  const email = args.email?.toLowerCase().trim();
  const id = args.customer_id?.trim();
  const customer = crm.find(
    (c) => (email && c.email.toLowerCase() === email) || (id && c.customer_id === id)
  );
  if (!customer) {
    return { found: false, message: "No customer matches that email or id." };
  }
  return {
    found: true,
    customer_id: customer.customer_id,
    name: customer.name,
    email: customer.email,
    loyalty_tier: customer.loyalty_tier,
    refunds_last_12_months: customer.refunds_last_12_months,
    orders: customer.orders.map((o) => ({
      order_id: o.order_id,
      item: o.item,
      amount: o.amount,
      delivery_status: o.delivery_status,
      refunded: o.refunded,
    })),
  };
}

function get_order(args: { order_id: string }) {
  const hit = findCustomerByOrder(args.order_id);
  if (!hit) return { found: false, message: `No order ${args.order_id} found.` };
  return { found: true, customer_id: hit.customer.customer_id, ...hit.order };
}

function check_refund_policy(args: { order_id: string }) {
  const hit = findCustomerByOrder(args.order_id);
  if (!hit) return { found: false, message: `No order ${args.order_id} found.` };
  const verdict = evaluatePolicy(hit.order, hit.customer, policyToday());
  return { found: true, ...verdict };
}

// process_refund is gated: it re-runs the policy check in code and refuses to
// pay out unless the verdict is eligible. The prompt alone cannot force a
// refund through this function.
function process_refund(args: { order_id: string }) {
  const hit = findCustomerByOrder(args.order_id);
  if (!hit) return { success: false, message: `No order ${args.order_id} found.` };

  const verdict = evaluatePolicy(hit.order, hit.customer, policyToday());
  if (!verdict.eligible) {
    return {
      success: false,
      blocked_by_policy: true,
      rule: verdict.rule,
      reason: verdict.reason,
      message: "Refund blocked. Order is not eligible under policy. No money was moved.",
    };
  }
  if (hit.order.refunded) {
    return { success: false, message: "Order was already refunded." };
  }

  hit.order.refunded = true;
  const confirmation = `RF-${Date.now().toString().slice(-8)}`;
  return {
    success: true,
    confirmation_number: confirmation,
    order_id: hit.order.order_id,
    refunded_amount: hit.order.amount,
    message: `Refund of $${hit.order.amount.toFixed(2)} processed.`,
  };
}

// ---- Dispatcher + schemas -------------------------------------------------

const impls: Record<string, (args: any) => unknown> = {
  lookup_customer,
  get_order,
  check_refund_policy,
  process_refund,
};

export function runTool(name: string, args: Record<string, unknown>): unknown {
  const fn = impls[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  try {
    return fn(args);
  } catch (err) {
    return { error: `Tool ${name} threw: ${(err as Error).message}` };
  }
}

export const tools = [
  {
    type: "function" as const,
    function: {
      name: "lookup_customer",
      description:
        "Find a customer by email or customer_id. Returns their profile, refund history, and a list of their orders. Use this first to locate the customer and their orders.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Customer email address" },
          customer_id: { type: "string", description: "Customer id, e.g. CUST-1001" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_order",
      description:
        "Get the full details of a single order by order_id: item, amount, dates, delivery status, and flags like final_sale, opened, defective, accessed, refunded.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order id, e.g. ORD-1001" },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_refund_policy",
      description:
        "Run the refund policy rules against an order and return a structured verdict: decision (approved, denied, needs_review), eligible, the rule that applied, and the reason. Always call this before deciding or processing a refund. Never decide eligibility yourself.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order id to evaluate" },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "process_refund",
      description:
        "Actually process the refund for an order. Only call this after check_refund_policy returns eligible (decision approved). It re-checks policy internally and will refuse if the order is not eligible.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order id to refund" },
        },
        required: ["order_id"],
      },
    },
  },
];
