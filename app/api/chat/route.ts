import { NextRequest, NextResponse } from "next/server";
import { runAgent, SimpleMessage } from "@/lib/agent";
import { newTurnId } from "@/lib/logstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: SimpleMessage[] = body.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });
    }
    const turnId = newTurnId();
    const result = await runAgent(messages, turnId);
    return NextResponse.json({ reply: result.reply, turnId, steps: result.steps });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Unexpected error" },
      { status: 500 }
    );
  }
}
