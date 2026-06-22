"use client";

import { useEffect, useMemo, useState } from "react";
import {
  UIEvent,
  Tone,
  buildTimeline,
  extractDecision,
} from "@/lib/activity";

const TONE_DOT: Record<Tone, string> = {
  success: "bg-green-600",
  error: "bg-red-600",
  warning: "bg-amber-500",
  info: "bg-blue-600",
  neutral: "bg-gray-400",
};

const DECISION_CHIP: Record<string, string> = {
  approved: "bg-green-100 text-green-700",
  denied: "bg-red-100 text-red-700",
  needs_review: "bg-amber-100 text-amber-800",
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

export default function HistoryPage() {
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/logs");
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as UIEvent;
        setEvents((prev) => (prev.some((x) => x.id === evt.id) ? prev : [...prev, evt]));
      } catch {
        /* heartbeat */
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  // Newest turns first.
  const turns = useMemo(() => {
    const map = new Map<string, UIEvent[]>();
    for (const e of events) {
      if (!map.has(e.turnId)) map.set(e.turnId, []);
      map.get(e.turnId)!.push(e);
    }
    return Array.from(map.entries()).reverse();
  }, [events]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Activity history</h1>
          <p className="text-sm text-gray-500">Every refund interaction the agent has handled this session.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            {connected ? "Live" : "Disconnected"}
          </span>
          <button
            onClick={() => setEvents([])}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      </div>

      {turns.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-gray-700">No interactions yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Open the console and send a request. It will show up here with the full decision trail.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {turns.map(([turnId, turnEvents], idx) => {
          const timeline = buildTimeline(turnEvents);
          const decision = extractDecision(turnEvents);
          const userMsg = turnEvents.find((e) => e.type === "user_message")?.detail;
          const time = new Date(turnEvents[0].ts).toLocaleTimeString();

          return (
            <div key={turnId} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Interaction {turns.length - idx} · {time}
                  </p>
                  {typeof userMsg === "string" && (
                    <p className="truncate text-sm text-gray-700">{userMsg}</p>
                  )}
                </div>
                {decision && (
                  <span
                    className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${DECISION_CHIP[decision.kind]}`}
                  >
                    {decision.title}
                  </span>
                )}
              </div>

              <div className="grid gap-5 px-5 py-4 md:grid-cols-2">
                <ol className="space-y-1">
                  {timeline.map((step, i) => (
                    <li key={step.id + i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`mt-1.5 flex h-4 w-4 items-center justify-center rounded-full ${TONE_DOT[step.tone]}`}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                        {i < timeline.length - 1 && <span className="my-0.5 w-px flex-1 bg-gray-200" />}
                      </div>
                      <div className="pb-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] text-gray-400">{fmtTime(step.ts)}</span>
                          {step.tool && (
                            <span className="rounded bg-gray-900 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
                              {step.tool}
                            </span>
                          )}
                          {step.outcome && step.outcome !== "RUNNING" && (
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                OUTCOME_BADGE[step.outcome] ?? "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {step.outcome}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-medium text-gray-900">{step.title}</p>
                        <p className="text-sm text-gray-500">{step.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {decision && (
                  <div className="self-start rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Final decision
                    </p>
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex gap-3">
                        <dt className="w-24 shrink-0 text-gray-500">Order</dt>
                        <dd className="font-medium text-gray-900">{decision.orderId}</dd>
                      </div>
                      <div className="flex gap-3">
                        <dt className="w-24 shrink-0 text-gray-500">Reason</dt>
                        <dd className="font-medium text-gray-900">{decision.reason}</dd>
                      </div>
                      <div className="flex gap-3">
                        <dt className="w-24 shrink-0 text-gray-500">Rule</dt>
                        <dd className="font-medium text-gray-900">
                          {decision.ruleCode} · {decision.ruleName}
                        </dd>
                      </div>
                      {decision.confirmation && (
                        <div className="flex gap-3">
                          <dt className="w-24 shrink-0 text-gray-500">Confirmation</dt>
                          <dd className="font-medium text-gray-900">{decision.confirmation}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
