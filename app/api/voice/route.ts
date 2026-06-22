import { NextRequest, NextResponse } from "next/server";
import { toFile } from "groq-sdk";
import { getGroq, STT_MODEL, TTS_MODEL, TTS_VOICE } from "@/lib/groq";
import { runAgent, SimpleMessage } from "@/lib/agent";
import { newTurnId } from "@/lib/logstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voice turn: audio in -> Groq Whisper transcription -> same agent loop ->
// Groq TTS -> audio back. Voice and text share one agent and one log stream.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    const historyRaw = form.get("history");

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "audio file is required" }, { status: 400 });
    }

    const history: SimpleMessage[] = historyRaw
      ? (JSON.parse(historyRaw.toString()) as SimpleMessage[])
      : [];

    const groq = getGroq();

    // 1. Transcribe with Groq Whisper.
    const buf = Buffer.from(await audio.arrayBuffer());
    const file = await toFile(buf, "audio.webm");
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: STT_MODEL,
    });
    const text = (transcription.text || "").trim();

    if (!text) {
      return NextResponse.json({
        transcript: "",
        reply: "I couldn't hear anything. Could you try again?",
        audioBase64: null,
      });
    }

    // 2. Run the same agent loop used for text chat.
    const turnId = newTurnId();
    const newHistory: SimpleMessage[] = [...history, { role: "user", content: text }];
    const result = await runAgent(newHistory, turnId);

    // 3. Synthesize the reply with Groq TTS. Optional: if it fails, the text
    // reply still returns so the demo never breaks on the bonus feature.
    let audioBase64: string | null = null;
    try {
      const speech = await groq.audio.speech.create({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: result.reply,
        response_format: "wav",
      });
      const ab = await speech.arrayBuffer();
      audioBase64 = Buffer.from(ab).toString("base64");
    } catch (ttsErr) {
      console.warn("[voice] TTS failed, returning text only:", (ttsErr as Error).message);
    }

    return NextResponse.json({
      transcript: text,
      reply: result.reply,
      audioBase64,
      turnId,
      steps: result.steps,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Voice processing failed" },
      { status: 500 }
    );
  }
}
