# Project status

Working. The app runs locally with `npm install && npm run dev` on Node 20+.

Verified:
- Text chat through the full agent loop with Groq tool calling.
- Customer lookup, order lookup, and policy validation appear in the live activity trace.
- All eight policy rules plus the platinum VIP exception produce the expected decisions
  across the 15 mock customers (see `docs/TEST-CHECKLIST.md`).

Notes:
- Voice (mic) uses Groq Whisper and Groq PlayAI TTS. Accept the PlayAI TTS terms once at
  https://console.groq.com if spoken replies come back silent; text replies work regardless.
- Mock data is dated to a 2026-06-22 reference (`POLICY_TODAY` in `.env.local`) so demo
  scenarios stay stable.

See `docs/` for architecture, the test checklist, and the Loom script.
