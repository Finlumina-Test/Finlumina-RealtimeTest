import fetch from "node-fetch";
import WebSocket from "ws";

// Simple linear resample PCM helper
function resample8to16(buffer8k) {
  const inSamples = new Int16Array(buffer8k.buffer);
  const outSamples = new Int16Array(inSamples.length * 2);
  for (let i = 0; i < inSamples.length; i++) {
    outSamples[i * 2] = inSamples[i];
    outSamples[i * 2 + 1] = inSamples[i];
  }
  return outSamples;
}

// PCM 16-bit to μ-law 8-bit (inline, no external package)
function pcm16ToMuLaw8(pcm16) {
  const MULAW_MAX = 0x1fff;
  const MULAW_BIAS = 33;
  const output = new Uint8Array(pcm16.length);

  for (let i = 0; i < pcm16.length; i++) {
    let sample = pcm16[i];
    let sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > MULAW_MAX) sample = MULAW_MAX;
    sample = sample + MULAW_BIAS;
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
      exponent--;
    }
    let mantissa = (sample >> (exponent + 3)) & 0x0f;
    output[i] = ~(sign | (exponent << 4) | mantissa);
  }

  return output;
}

export function setupRealtime(app) {
  app.ws("/realtime", (ws) => {
    console.log("✅ Twilio WebSocket connected");

    let openAIWs;

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        // 1️⃣ Ephemeral key request
        if (data.type === "get-ephemeral-key") {
          console.log("🔑 Request for ephemeral key from OpenAI...");
          const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-realtime-preview-2024-12-17",
              voice: "verse",
            }),
          });

          const keyData = await resp.json();
          if (!keyData.client_secret?.value) {
            ws.send(JSON.stringify({ type: "error", error: "No ephemeral key returned" }));
            console.error("❌ OpenAI ephemeral key error:", keyData);
            return;
          }

          ws.send(JSON.stringify({ type: "ephemeral-key", data: keyData.client_secret.value }));
          console.log("✅ Ephemeral key sent to Twilio");

          // 2️⃣ Connect to OpenAI Realtime
          openAIWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
            headers: {
              Authorization: `Bearer ${keyData.client_secret.value}`,
              "OpenAI-Beta": "realtime=v1",
            },
          });

          openAIWs.on("open", () => console.log("✅ Connected to OpenAI Realtime"));

          openAIWs.on("message", (msg) => {
            const resp = JSON.parse(msg.toString());
            if (resp.type === "audio_chunk") {
              // Convert OpenAI audio to μ-law 8kHz for Twilio
              const pcm16 = new Int16Array(Buffer.from(resp.audio, "base64").buffer);
              const muLaw8 = pcm16ToMuLaw8(pcm16);
              ws.send(JSON.stringify({
                type: "media",
                media: Buffer.from(muLaw8).toString("base64")
              }));
            }
          });
        }

        // 3️⃣ Twilio sends audio chunks
        if (data.type === "input_audio_buffer") {
          if (openAIWs && openAIWs.readyState === 1) {
            // Resample 8k → 16k and forward
            const buffer8k = new Int16Array(Buffer.from(data.audio, "base64").buffer);
            const buffer16k = resample8to16(buffer8k);
            openAIWs.send(JSON.stringify({
              type: "input_audio_buffer",
              audio: Buffer.from(buffer16k).toString("base64"),
            }));
          }
        }

        // 4️⃣ Text input messages (optional)
        if (data.type === "input_text") {
          if (openAIWs && openAIWs.readyState === 1) {
            openAIWs.send(JSON.stringify({
              type: "input_text",
              text: data.text,
            }));
          }
        }

      } catch (err) {
        console.error("❌ WebSocket error:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("⚠️ Twilio WebSocket disconnected");
      if (openAIWs) openAIWs.close();
    });
  });
}