# AI Customer Support Refund Agent

## Overview

An AI-powered customer support agent that processes e-commerce refunds using Groq
LLM reasoning, tool orchestration, and deterministic policy validation. A customer
asks for a refund in plain language; the agent looks up their account and order,
checks the request against company policy, and either issues the refund or
explains why it can't. Every decision is shown step by step in a live activity
panel, so a support team can see exactly how the agent reasoned.

The defining design choice is that the language model never decides eligibility on
its own. It handles the conversation and chooses which tools to call, but the
actual approve/deny decision is made by a deterministic rule engine in code. This
prevents the model from hallucinating a refund approval.

## Architecture

```
Customer (chat or voice)
        │
        ▼
   Groq LLM            llama-3.3-70b-versatile
        │              decides which tool to call
        ▼
Agent Orchestrator     runs the tool, feeds the result back, loops
        │
        ├──────────────┬───────────────┐
        ▼              ▼               ▼
    CRM Tool       Order Tool      Policy Tool ── rule engine
        │              │               │
        └──────────────┴───────────────┘
        │
        ▼
     Decision          approved / denied / needs review
        │
        ▼
Customer reply + real-time reasoning trace
```

See `docs/ARCHITECTURE.md` for the detailed version.

## Features

- Customer chat interface with text and voice input
- Admin reasoning dashboard with a human-readable, tool-tagged activity trace
- Groq tool calling (CRM lookup, order lookup, policy engine, refund processor)
- Deterministic policy enforcement with eight rules plus a VIP exception
- Real-time logs streamed over Server-Sent Events
- Refund approval, denial, and manual-review workflows
- Voice pipeline: Groq Whisper speech-to-text and Groq PlayAI text-to-speech

## Setup

```bash
npm install
cp .env.example .env.local   # then add your key: GROQ_API_KEY=...
npm run dev
```

Open http://localhost:3000 for the support console and http://localhost:3000/admin
for the activity history. Get a free Groq API key at https://console.groq.com/keys.

The mock data is tuned to a reference date of 2026-06-22, set as `POLICY_TODAY` in
`.env.local`, so the demo scenarios stay stable. Remove that line to use the real
current date.

## Project structure

```
app/                  Next.js App Router
  page.tsx            customer console (chat + live activity)
  admin/page.tsx      activity history dashboard
  api/chat            text turn -> agent loop
  api/voice           audio -> speech-to-text -> agent -> text-to-speech
  api/logs            Server-Sent Events stream of reasoning
lib/
  agent.ts            the tool-calling agent loop
  tools.ts            tool implementations and schemas
  policy.ts           deterministic rule engine
  activity.ts         turns raw events into readable timeline steps
  groq.ts             Groq client and model names
  logstore.ts         in-memory event log and emitter
data/
  crm.json            15 customer profiles
  refund-policy.md    the policy the agent enforces
docs/
  ARCHITECTURE.md     detailed architecture
  TEST-CHECKLIST.md   demo scenarios and expected results
  LOOM-SCRIPT.md      walkthrough script
```

## Policy rules

R1 30-day return window (platinum VIP customers get 60 days), R2 final sale never
refundable, R3 digital goods non-refundable once accessed, R4 opened electronics
refundable only if defective and within 14 days, R5 refund-abuse review for 3+
refunds in 12 months, R6 manager approval for orders over $500, R7 no double
refunds, R8 undelivered orders cannot be refunded.

## Demo

See `docs/TEST-CHECKLIST.md` for the full list with exact order ids. Quick set:
ORD-1001 (approved), ORD-1003 (denied, final sale), ORD-1014 (approved, VIP
exception), ORD-1007 (escalated, over $500).

## What I would build next

Retrieval over a larger policy document, a real database instead of JSON files,
authentication on the admin dashboard, and full duplex streaming voice.
