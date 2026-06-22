import { NextRequest } from "next/server";
import { bus, events, AgentEvent } from "@/lib/logstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events stream. On connect it replays the recent backlog, then
// pushes every new agent event live to the admin dashboard.
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let listener: ((evt: AgentEvent) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (evt: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      for (const e of events.slice(-100)) send(e);

      listener = (evt: AgentEvent) => send(evt);
      bus.on("event", listener);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // ignore
        }
      }, 15000);

      const cleanup = () => {
        if (listener) bus.off("event", listener);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // ignore
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (listener) bus.off("event", listener);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
