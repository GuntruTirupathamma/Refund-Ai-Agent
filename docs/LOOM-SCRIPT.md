# Loom script (7 to 10 minutes)

Have two browser tabs ready: the console at localhost:3000 and the Activity
history at localhost:3000/admin. Have your editor open with `lib/agent.ts`,
`lib/tools.ts`, and `lib/policy.ts`. Run through the test checklist once before
recording so nothing surprises you. Speak to the decisions you made, not just the
features.

## Minute 1 — Problem

"This is an AI customer support agent for e-commerce refunds. A customer asks for
a refund in plain language, the agent looks up their account and order, checks it
against company policy, and either issues the refund or explains why it can't.
The whole point is transparency: a support lead can watch exactly how each
decision was made."

Show the console sitting idle so they see the two-panel layout.

## Minute 2 — Architecture

"Under the hood there are four pieces: Groq runs the language model, an agent
orchestrator runs a tool-calling loop, the tools talk to a mock CRM and an order
store, and a separate policy engine makes the actual eligibility decision in
code. I deliberately kept the model's reasoning separate from the policy
decision, and I'll come back to why."

Show `docs/ARCHITECTURE.md` diagram briefly.

## Minutes 3 to 4 — Standard refund (approved)

Type: `Refund ORD-1001, email priya@example.com`.

Narrate the right panel as it builds: "It calls CRM_LOOKUP and finds Priya, then
ORDER_LOOKUP pulls the order, then POLICY_ENGINE validates it, all rules pass,
and REFUND_PROCESSOR issues the refund." Point at the green decision card with the
amount and confirmation number.

## Minutes 5 to 6 — Denied refund (holding the line)

Type: `Refund ORD-1003, email elena@example.com` (final sale).

"Same pipeline, but the policy engine returns denied on rule R2, final sale. The
agent does not issue the refund, it explains the rule politely." Show the red
decision card: DENIED, R2, no refund issued.

Optional second denial to show abuse handling: `Refund ORD-1005,
email sara@example.com` (already refunded, R7).

Then the VIP exception: `Refund ORD-1014, email james@example.com`. "James is a
platinum member. This order is past the normal 30-day window, but platinum gets a
60-day window, so it's approved. The same order for a regular customer would be
denied, which shows the policy engine handles tiers, not just a flat rule."

If voice is working, do one spoken request here with the mic button.

## Minute 7 — Transparency / admin

Switch to the Activity history tab. "Every interaction is logged as readable
steps with timestamps and the tool that ran, not raw JSON. A support lead can
audit any decision. This is also where retries and the step-limit safety cap
would show up if the model misbehaved."

## Minute 8 — Code walkthrough

Open the files:
- `lib/agent.ts`: "Here's the loop. It calls Groq, and if the model asks for a tool, I run it, log it, feed the result back, and loop, with a six-step cap."
- `lib/tools.ts`: "Four tools. Note process_refund re-checks policy before paying out."
- `lib/policy.ts`: "This is the rule engine. Eight rules plus the VIP exception, all in plain code."

## Minute 9 — Tradeoffs (this is the part that lands)

"The main decision I made: I separated LLM reasoning from policy decisions. The
model is good at understanding the request and talking to the customer, but I
never let it decide eligibility. That's done in deterministic code, and the
payout function re-checks it. So even if someone tries to talk the agent into a
refund, it cannot approve something policy forbids. I used raw function calling
instead of a heavier framework so the loop stays explicit and easy to audit. If I
took this further I'd add retrieval over a larger policy document, a real
database, and auth on the admin view."

Close on the GitHub repo and README.
