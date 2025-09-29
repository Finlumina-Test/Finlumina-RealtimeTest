// services/realtime-conversation.js
import WebSocket from "ws";
import fetch from "node-fetch";
import { Transform } from "stream";
import { spawn } from "child_process";

/**
 * Resample PCM16 16kHz → 8kHz using ffmpeg
 * Twilio expects 8kHz 16-bit PCM mono
 */
function resampleAudioBuffer(inputBase64) {
  return new Promise((resolve, reject) => {
    const inputBuffer = Buffer.from(inputBase64, "base64");
    const ffmpeg = spawn("ffmpeg", [
      "-f",
      "s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-f",
      "s16le",
      "-ar",
      "8000",
      "-ac",
      "1",
      "pipe:1",
    ]);

    const chunks = [];
    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
    ffmpeg.stderr.on("data", () => {}); // ignore logs

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks).toString("base64"));
      else reject(new Error("FFmpeg resample failed"));
    });

    ffmpeg.stdin.write(inputBuffer);
    ffmpeg.stdin.end();
  });
}

export default async function realtimeConversation(twilioWs, req) {
  console.log("✅ Twilio WS connected");

  // 1️⃣ Fetch ephemeral key
  let ephemeralKey;
  try {
    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12",
        voice: "verse",
      }),
    });
    const data = await resp.json();
    ephemeralKey = data.client_secret?.value;
    if (!ephemeralKey) throw new Error("No ephemeral key received");
    console.log("🔑 Ephemeral key fetched");
  } catch (err) {
    console.error("❌ Failed to fetch ephemeral key:", err);
    twilioWs.close();
    return;
  }

  // 2️⃣ Connect to OpenAI Realtime API
  const openAiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12",
    { headers: { Authorization: `Bearer ${ephemeralKey}`, "OpenAI-Beta": "realtime=v1" } }
  );

  openAiWs.on("open", () => console.log("🔗 Connected to OpenAI Realtime API"));

  // 3️⃣ OpenAI → Twilio
  openAiWs.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === "output_audio_buffer" && data.audio) {
        // Resample 16kHz → 8kHz PCM for Twilio
        const twilioAudio = await resampleAudioBuffer(data.audio);

        twilioWs.send(
          JSON.stringify({ event: "media", media: { payload: twilioAudio, track: "outbound" } })
        );
      }

      // Log AI text
      if (data.type === "message" && data.message?.content) {
        console.log("AI:", data.message.content[0]?.text || "");
      }
    } catch (e) {
      console.error("❌ Failed to parse OpenAI message:", e);
    }
  });

  openAiWs.on("close", () => {
    console.log("❌ OpenAI WS closed");
    twilioWs.close();
  });
  openAiWs.on("error", (err) => {
    console.error("❌ OpenAI WS error:", err);
    twilioWs.close();
  });

  // 4️⃣ Twilio → OpenAI
  twilioWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.event === "media" && data.media?.payload) {
        openAiWs.send(JSON.stringify({ type: "input_audio_buffer", audio: data.media.payload }));
      }
    } catch (e) {
      console.error("❌ Failed to parse Twilio WS message:", e);
    }
  });

  twilioWs.on("close", () => {
    console.log("❌ Twilio WS closed");
    openAiWs.close();
  });
}