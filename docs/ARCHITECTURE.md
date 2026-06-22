# Architecture

## Overview

The system is an AI customer support agent that processes e-commerce refunds. It
combines Groq LLM reasoning with deterministic policy validation. The model
decides what to do and talks to the customer; a code-based rule engine decides
whether a refund is actually allowed. Keeping those two responsibilities
separate is the core design choice, it prevents the model from hallucinating an
approval.

## Flow

```
            Customer (chat or voice)
                    │
                    ▼
              Groq LLM  (llama-3.3-70b-versatile)
                    │   decides which tool to call
                    ▼
            Agent orchestrator  (lib/agent.ts)
                    │   runs the tool, feeds the result back, loops
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
   CRM tool     Order tool     Policy tool
 lookup_customer get_order   check_refund_policy ── rule engine (lib/policy.ts)
        │           │               │
        └───────────┴───────────────┘
                    │
                    ▼
            process_refund  (gated: re-checks policy before paying out)
                    │
                    ▼
                 Decision  (approved / denied / needs review)
                    │
                    ▼
   Customer reply  +  live reasoning trace in the admin panel
```

## The agent loop

`lib/agent.ts` runs a bounded loop. It sends Groq the system prompt (role plus
the full policy), the conversation, and the tool definitions. The model either
answers or requests tool calls. For each tool call the orchestrator runs the
real function, logs the step, appends the result, and loops again. It stops when
the model returns a plain answer or after a six-step safety cap. Every step is
logged and streamed to the UI, so the reasoning trace is a byproduct of the loop
rather than a bolt-on.

## Tools

- `lookup_customer` (CRM_LOOKUP): find a customer by email or id.
- `get_order` (ORDER_LOOKUP): fetch order details and flags.
- `check_refund_policy` (POLICY_ENGINE): run the rules, return a structured verdict.
- `process_refund` (REFUND_PROCESSOR): perform the refund, gated so it refuses unless the order is eligible.

## Policy enforcement

`lib/policy.ts` encodes eight rules plus a platinum VIP exception. The same rules
are written in plain language in `data/refund-policy.md` and pasted into the
system prompt so the model can explain itself, while the code is what actually
decides. `process_refund` re-runs the policy check before moving any money, so a
persuasive customer cannot talk the model into a payout.

## Frontend

A single two-panel console: customer conversation on the left, a live
human-readable activity timeline and decision card on the right. The timeline
translates raw tool events into tool-tagged steps with timestamps and status
badges. A separate Activity history page shows every past interaction. Both are
fed by a Server-Sent Events stream from `app/api/logs`.

## Tech

Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Groq SDK. Groq Whisper
for speech to text and Groq PlayAI TTS for voice replies.
