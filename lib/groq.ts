import Groq from "groq-sdk";

// Lazily create the Groq client so importing this module never throws at build
// time (Vercel collects page data without env vars). The client is created on
// first use at request time, when GROQ_API_KEY is available.
let _client: Groq | null = null;

export function getGroq(): Groq {
  if (!_client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GROQ_API_KEY is not set. Add it to .env.local locally, or to your Vercel project's Environment Variables."
      );
    }
    _client = new Groq({ apiKey });
  }
  return _client;
}

// Main reasoning + tool-calling model.
export const CHAT_MODEL = "llama-3.3-70b-versatile";

// Speech to text and text to speech (Groq).
export const STT_MODEL = "whisper-large-v3-turbo";
export const TTS_MODEL = "playai-tts";
export const TTS_VOICE = "Fritz-PlayAI";
