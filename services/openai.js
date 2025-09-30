// services/openai.js
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Create an ephemeral key for OpenAI Realtime API
 * This key is short-lived (about 1 minute) and safe to give to clients
 */
export async function getEphemeralKey() {
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-realtime-preview-2024-12",
      modalities: ["text", "audio"],
      audio: { voice: "verse", format: "wav" },
      ephemeral: true,
    });

    return resp.client_secret;
  } catch (err) {
    console.error("❌ Error fetching ephemeral key:", err);
    throw err;
  }
}