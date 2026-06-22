"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  UIEvent,
  TimelineStep,
  Decision,
  Tone,
  buildTimeline,
  extractDecision,
} from "@/lib/activity";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SCENARIOS = [
  {
    label: "Standard refund",
    hint: "Eligible order, inside window",
    text: "Hi, I'd like a refund for order ORD-1001. My email is priya@example.com.",
  },
  {
    label: "Final sale (denied)",
    hint: "Policy violation, holds the line",
    text: "I want to return order ORD-1003, the clearance jacket. Email elena@example.com.",
  },
  {
    label: "Defective electronics",
    hint: "Approved under the defect rule",
    text: "My keyboard from order ORD-1009 arrived broken. Email nadia@example.com.",
  },
  {
    label: "High-value (review)",
    hint: "Needs manager approval",
    text: "Please refund my TV, order ORD-1007. This is aisha@example.com.",
  },
];

const TONE_DOT: Record<Tone, string> = {
  success: "bg-green-600",
  error: "bg-red-600",
  warning: "bg-amber-500",
  info: "bg-blue-600",
  neutral: "bg-gray-400",
};

const OUTCOME_BADGE: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-700",
  APPROVED: "bg-green-100 text-green-700",
  DENIED: "bg-red-100 text-red-700",
  BLOCKED: "bg-red-100 text-red-700",
  ERROR: "bg-red-100 text-red-700",
  "NEEDS REVIEW": "bg-amber-100 text-amber-800",
  "NOT FOUND": "bg-amber-100 text-amber-800",
  "NO ACTION": "bg-gray-100 text-gray-600",
  RUNNING: "bg-blue-100 text-blue-700",
  DONE: "bg-gray-100 text-gray-600",
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

export default function ConsolePage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi, I'm here to help with refunds. Share your order number and email, and tell me what you'd like to return.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [turnStart, setTurnStart] = useState<number | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Subscribe to the live activity stream.
  useEffect(() => {
    const es = new EventSource("/api/logs");
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as UIEvent;
        setEvents((prev) => (prev.some((x) => x.id === evt.id) ? prev : [...prev, evt]));
      } catch {
        /* heartbeat */
      }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Events for the current interaction: by exact turn once known, otherwise by
  // time so the panel updates live while the agent is still working.
  const currentEvents = useMemo(() => {
    if (activeTurnId) return events.filter((e) => e.turnId === activeTurnId);
    if (turnStart) return events.filter((e) => e.ts >= turnStart - 4000);
    return [];
  }, [events, activeTurnId, turnStart]);

  const timeline: TimelineStep[] = useMemo(() => buildTimeline(currentEvents), [currentEvents]);
  const decision: Decision | null = useMemo(() => extractDecision(currentEvents), [currentEvents]);

  async function sendText(text: string) {
    if (!text.trim() || loading) return;
    const next = [...messages, { role: "user" as const, content: text.trim() }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setTurnStart(Date.now());
    setActiveTurnId(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (data.turnId) setActiveTurnId(data.turnId);
      setMessages([...next, { role: "assistant", content: data.reply ?? data.error ?? "(no reply)" }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void sendVoice(new Blob(chunksRef.current, { type: "audio/webm" }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      alert("Microphone access was blocked. You can still type your request.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function sendVoice(blob: Blob) {
    setLoading(true);
    setTurnStart(Date.now());
    setActiveTurnId(null);
    try {
      const form = new FormData();
      form.append("audio", blob, "audio.webm");
      form.append("history", JSON.stringify(messages));
      const res = await fetch("/api/voice", { method: "POST", body: form });
      const data = await res.json();
      if (data.turnId) setActiveTurnId(data.turnId);
      const turn: Msg[] = [];
      if (data.transcript) turn.push({ role: "user", content: data.transcript });
      turn.push({ role: "assistant", content: data.reply ?? data.error ?? "(no reply)" });
      setMessages((prev) => [...prev, ...turn]);
      if (data.audioBase64 && audioRef.current) {
        audioRef.current.src = `data:audio/wav;base64,${data.audioBase64}`;
        void audioRef.current.play().catch(() => undefined);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Voice request failed. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* LEFT: conversation */}
      <section className="lg:col-span-2">
        <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Customer conversation</h2>
            <p className="text-sm text-gray-500">Chat with the refund assistant, or use voice.</p>
          </div>

          {/* Scenarios */}
          <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Example scenarios
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SCENARIOS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => sendText(s.text)}
                  disabled={loading}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-gray-800">{s.label}</span>
                  <span className="block text-xs text-gray-500">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-blue-600 text-white"
                      : "rounded-bl-sm border border-gray-200 bg-gray-50 text-gray-800"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.2s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.1s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-300" />
                <span>Agent is working</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendText(input)}
                placeholder="Type your refund request…"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={() => (recording ? stopRecording() : startRecording())}
                title="Voice input"
                className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${
                  recording
                    ? "border-red-200 bg-red-50 text-red-600"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {recording ? (
                  <span className="h-3 w-3 rounded-sm bg-red-600" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => sendText(input)}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
            {recording && (
              <p className="mt-2 text-xs text-red-600">Recording… click the square to stop and send.</p>
            )}
          </div>
        </div>
      </section>

      {/* RIGHT: agent activity */}
      <aside className="lg:col-span-1">
        <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Agent activity</h2>
              <p className="text-sm text-gray-500">How the decision is being made.</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Live
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {decision && <DecisionCard decision={decision} />}

            {timeline.length === 0 && !decision ? (
              <EmptyState />
            ) : (
              <ol className="relative space-y-1">
                {timeline.map((step, i) => (
                  <li key={step.id + i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      {step.status === "active" ? (
                        <span className="mt-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-200">
                          <svg className="h-3 w-3 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                          </svg>
                        </span>
                      ) : (
                        <span className={`mt-1.5 flex h-5 w-5 items-center justify-center rounded-full ${TONE_DOT[step.tone]}`}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      )}
                      {i < timeline.length - 1 && <span className="my-0.5 w-px flex-1 bg-gray-200" />}
                    </div>
                    <div className="pb-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] text-gray-400">{fmtTime(step.ts)}</span>
                        {step.tool && (
                          <span className="rounded bg-gray-900 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
                            {step.tool}
                          </span>
                        )}
                        {step.outcome && (
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                              OUTCOME_BADGE[step.outcome] ?? "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {step.outcome}
                          </span>
                        )}
                      </div>
                      <p className={`mt-1 text-sm font-medium ${step.status === "active" ? "text-blue-700" : "text-gray-900"}`}>
                        {step.title}
                      </p>
                      <p className="text-sm text-gray-500">{step.description}</p>
                    </div>
                  </li>
                ))}
                {loading && !timeline.some((s) => s.status === "active") && (
                  <li className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1.5 h-5 w-5 animate-pulse rounded-full bg-gray-200" />
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium text-gray-400">Working…</p>
                    </div>
                  </li>
                )}
              </ol>
            )}
          </div>
        </div>
      </aside>

      <audio ref={audioRef} hidden />
    </div>
  );
}

function DecisionCard({ decision }: { decision: Decision }) {
  const styles: Record<string, { box: string; bar: string; text: string; chip: string }> = {
    approved: {
      box: "border-green-200 bg-green-50",
      bar: "bg-green-600",
      text: "text-green-800",
      chip: "bg-green-100 text-green-700",
    },
    denied: {
      box: "border-red-200 bg-red-50",
      bar: "bg-red-600",
      text: "text-red-800",
      chip: "bg-red-100 text-red-700",
    },
    needs_review: {
      box: "border-amber-200 bg-amber-50",
      bar: "bg-amber-500",
      text: "text-amber-800",
      chip: "bg-amber-100 text-amber-800",
    },
  };
  const s = styles[decision.kind];
  const action =
    decision.kind === "approved"
      ? "Refund issued"
      : decision.kind === "denied"
      ? "No refund issued"
      : "Routed to manual review";
  return (
    <div className={`mb-5 overflow-hidden rounded-xl border ${s.box}`}>
      <div className={`h-1.5 w-full ${s.bar}`} />
      <div className="p-4">
        <p className={`text-lg font-bold uppercase tracking-wide ${s.text}`}>{decision.title}</p>
        <div className="mt-3 space-y-2 text-sm">
          <Row label="Order" value={decision.orderId} />
          {decision.kind === "approved" && typeof decision.amount === "number" && (
            <Row label="Amount" value={`$${decision.amount.toFixed(2)}`} />
          )}
          <Row label="Reason" value={decision.reason} />
          {decision.ruleCode && (
            <Row
              label="Policy"
              value={
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${s.chip}`}>
                  {decision.ruleCode} · {decision.ruleName}
                </span>
              }
            />
          )}
          <Row label="Action" value={action} />
          {decision.confirmation && <Row label="Confirmation" value={decision.confirmation} />}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700">No activity yet</p>
      <p className="mt-1 text-sm text-gray-500">
        Send a request or pick a scenario. Each step the agent takes will appear here in plain language.
      </p>
    </div>
  );
}
