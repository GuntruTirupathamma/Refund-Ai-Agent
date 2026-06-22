import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY) {
  // Not throwing here so `next build` can run without a key. Routes will
  // surface a clear error at request time if the key is missing.
  console.warn("[groq] GROQ_API_KEY is not set. Add it to .env.local before running.");
}

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Main reasoning + tool-calling model.
export const CHAT_MODEL = "llama-3.3-70b-versatile";

// Speech to text and text to speech (Groq).
export const STT_MODEL = "whisper-large-v3-turbo";
export const TTS_MODEL = "playai-tts";
export const TTS_VOICE = "Fritz-PlayAI";
