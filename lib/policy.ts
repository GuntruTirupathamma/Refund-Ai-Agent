// Deterministic refund rule engine. The LLM never decides eligibility on its
// own. It calls check_refund_policy, which runs this code against real order
// fields and returns a structured verdict. This is where the agent "holds the
// line": the rules are enforced here, not in the prompt.

export interface Order {
  order_id: string;
  item: string;
  category: string;
  amount: number;
  purchase_date: string;
  delivery_date: string | null;
  delivery_status: string;
  final_sale: boolean;
  opened: boolean;
  defective: boolean;
  accessed: boolean;
  refunded: boolean;
}

export interface Customer {
  customer_id: string;
  name: string;
  email: string;
  loyalty_tier: string;
  account_created: string;
  refunds_last_12_months: number;
  orders: Order[];
}

export type Decision = "approved" | "denied" | "needs_review";

export interface Verdict {
  order_id: string;
  decision: Decision;
  eligible: boolean;
  rule: string;
  reason: string;
  refund_amount: number;
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO + "T00:00:00Z").getTime();
  const to = new Date(toISO + "T00:00:00Z").getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

// today is an ISO date string (YYYY-MM-DD). Defaults to the real current date.
export function evaluatePolicy(
  order: Order,
  customer: Customer,
  today: string = new Date().toISOString().slice(0, 10)
): Verdict {
  const base = { order_id: order.order_id, refund_amount: order.amount };

  // R7 already refunded
  if (order.refunded) {
    return {
      ...base,
      decision: "denied",
      eligible: false,
      rule: "R7",
      reason: "This order has already been refunded and cannot be refunded again.",
    };
  }

  // R8 not delivered
  if (order.delivery_status !== "delivered" || !order.delivery_date) {
    return {
      ...base,
      decision: "denied",
      eligible: false,
      rule: "R8",
      reason: `Order is not delivered yet (status: ${order.delivery_status}). Undelivered orders cannot be refunded.`,
    };
  }

  // R2 final sale
  if (order.final_sale) {
    return {
      ...base,
      decision: "denied",
      eligible: false,
      rule: "R2",
      reason: "This item was a final sale and is never refundable.",
    };
  }

  // R3 digital accessed
  if (order.category === "digital" && order.accessed) {
    return {
      ...base,
      decision: "denied",
      eligible: false,
      rule: "R3",
      reason: "Digital goods are non-refundable once they have been accessed or downloaded.",
    };
  }

  const ageDays = daysBetween(order.delivery_date, today);
  const isVip = customer.loyalty_tier === "platinum";
  const windowDays = isVip ? 60 : 30;

  // R1 outside return window. Platinum (VIP) customers get an extended 60-day
  // window; everyone else is 30 days.
  if (ageDays > windowDays) {
    return {
      ...base,
      decision: "denied",
      eligible: false,
      rule: "R1",
      reason: `Delivered ${ageDays} days ago, past the ${windowDays}-day return window${isVip ? " (VIP extended)" : ""}.`,
    };
  }

  // R4 opened electronics
  if (order.category === "electronics" && order.opened) {
    if (ageDays > 14) {
      return {
        ...base,
        decision: "denied",
        eligible: false,
        rule: "R4",
        reason: `Opened electronics are only refundable within 14 days. This was delivered ${ageDays} days ago.`,
      };
    }
    if (!order.defective) {
      return {
        ...base,
        decision: "denied",
        eligible: false,
        rule: "R4",
        reason: "Opened electronics are only refundable if confirmed defective. This item is not marked defective.",
      };
    }
    // within 14 days and defective -> falls through to abuse / value checks
  }

  // R5 refund abuse
  if (customer.refunds_last_12_months >= 3) {
    return {
      ...base,
      decision: "needs_review",
      eligible: false,
      rule: "R5",
      reason: `Customer has ${customer.refunds_last_12_months} refunds in the last 12 months and is flagged. Requires manual review.`,
    };
  }

  // R6 high value
  if (order.amount > 500) {
    return {
      ...base,
      decision: "needs_review",
      eligible: false,
      rule: "R6",
      reason: `Order amount $${order.amount.toFixed(2)} exceeds $500 and requires manager approval.`,
    };
  }

  // Approved
  return {
    ...base,
    decision: "approved",
    eligible: true,
    rule: isVip && ageDays > 30 ? "VIP" : "OK",
    reason:
      isVip && ageDays > 30
        ? `Approved under the 60-day VIP window for platinum members (delivered ${ageDays} days ago).`
        : `Within the ${windowDays}-day window (delivered ${ageDays} days ago) and meets all policy rules.`,
  };
}
