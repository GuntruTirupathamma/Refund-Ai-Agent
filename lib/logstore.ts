import { EventEmitter } from "events";

export type AgentEventType =
  | "user_message"
  | "model_step"
  | "tool_call"
  | "tool_result"
  | "final_answer"
  | "retry"
  | "error"
  | "limit_reached";

export interface AgentEvent {
  id: string;
  turnId: string;
  ts: number;
  type: AgentEventType;
  label: string;
  detail?: unknown;
}

// The log bus and history are stored on globalThis so they survive module
// reloads in dev and are shared across every route handler in the same
// server process. The chat/voice routes write events; the logs route streams
// them to the admin dashboard.
interface LogGlobal {
  bus: EventEmitter;
  events: AgentEvent[];
}

const g = globalThis as unknown as { __refundLog?: LogGlobal };

if (!g.__refundLog) {
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  g.__refundLog = { bus, events: [] };
}

export const bus = g.__refundLog.bus;
export const events = g.__refundLog.events;

export function log(
  turnId: string,
  type: AgentEventType,
  label: string,
  detail?: unknown
): AgentEvent {
  const evt: AgentEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    turnId,
    ts: Date.now(),
    type,
    label,
    detail,
  };
  events.push(evt);
  // Keep memory bounded for a long-running demo.
  if (events.length > 500) events.splice(0, events.length - 500);
  bus.emit("event", evt);
  return evt;
}

export function newTurnId(): string {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
