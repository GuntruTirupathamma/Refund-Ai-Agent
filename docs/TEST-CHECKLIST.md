# Demo test checklist

Reference date is 2026-06-22 (set by `POLICY_TODAY` in `.env.local`), so these
outcomes are stable. Run each one before recording so there are no surprises.
For every row, type the exact text in the customer chat and watch the right
panel build the trace and decision card.

| # | Scenario | Say this | Expected decision | Rule |
|---|---|---|---|---|
| 1 | Standard refund | `Refund ORD-1001, email priya@example.com` | APPROVED | OK |
| 2 | Outside 30 days | `Refund ORD-1002, email marcus@example.com` | DENIED | R1 |
| 3 | Digital product | `Refund ORD-1004, email david@example.com` | DENIED | R3 |
| 4 | Already refunded | `Refund ORD-1005, email sara@example.com` | DENIED | R7 |
| 5 | VIP exception | `Refund ORD-1014, email james@example.com` | APPROVED | VIP |
| 6 | High-value refund | `Refund ORD-1007, email aisha@example.com` | NEEDS REVIEW (escalated) | R6 |
| 7 | Invalid order id | `Refund ORD-9999, email priya@example.com` | Agent asks for clarification | n/a |

## Why each behaves this way

1. ORD-1001: delivered 10 days ago, unopened electronics, under $500. Clean approval.
2. ORD-1002: delivered ~49 days ago. Past the 30-day window, denied under R1.
3. ORD-1004: digital course, already accessed. Non-refundable under R3.
4. ORD-1005: already refunded once. Cannot refund twice, R7.
5. ORD-1014: James is platinum. Delivered ~45 days ago, which is past 30 but inside
   the 60-day VIP window, so it is approved under the VIP exception. The same order
   for a non-platinum customer would be denied under R1, which is the point.
6. ORD-1007: a $1499 TV. Over $500, so it is escalated to manual review under R6.
   The agent does not auto-approve it.
7. ORD-9999 does not exist. The lookup returns not found and the agent should ask
   for a valid order id or email rather than guess.

## Bonus scenarios if you want more

- ORD-1003 (elena@example.com): final sale, DENIED R2. A strong "holding the line" demo.
- ORD-1009 (nadia@example.com): opened keyboard that is defective, APPROVED under R4.
- ORD-1008 (liam@example.com): opened mouse, not defective, DENIED R4.
- ORD-1010 (chen@example.com): not delivered yet, DENIED R8.
- ORD-1006 (tomas@example.com): customer with 4 prior refunds, NEEDS REVIEW R5.

## Greeting check

Type `hi`. The agent should greet you and ask for an order number and email, and the
activity panel should stay empty (no tool calls for small talk).
