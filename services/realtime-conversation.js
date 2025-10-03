// services/realtime-conversation.js
import fetch from "node-fetch";
import WebSocket from "ws";

// Resample 8k → 24k PCM16 (Twilio → OpenAI expects 24k)
function resampleTo24k(buffer8k) {
  const inSamples = new Int16Array(buffer8k.buffer, buffer8k.byteOffset, buffer8k.length / 2);
  const inLen = inSamples.length;
  if (inLen === 0) return new Int16Array(0);
  const outLen = Math.floor(inLen * 24 / 8);
  const outSamples = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const srcPos = (i * (inLen - 1)) / Math.max(outLen - 1, 1);
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s1 = inSamples[idx] || 0;
    const s2 = inSamples[Math.min(idx + 1, inLen - 1)] || 0;
    const interpolated = (1 - frac) * s1 + frac * s2;
    outSamples[i] = Math.max(-32768, Math.min(32767, Math.round(interpolated)));
  }
  return outSamples;
}

// Resample 24k → 8k PCM16 (OpenAI → Twilio expects 8k μ-law)
function resample24kTo8k(buffer24k) {
  const inSamples = new Int16Array(buffer24k.buffer, buffer24k.byteOffset, buffer24k.length / 2);
  const inLen = inSamples.length;
  if (inLen === 0) return new Int16Array(0);
  const outLen = Math.floor(inLen * 8 / 24);
  const outSamples = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const srcPos = (i * (inLen - 1)) / Math.max(outLen - 1, 1);
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s1 = inSamples[idx] || 0;
    const s2 = inSamples[Math.min(idx + 1, inLen - 1)] || 0;
    const interpolated = (1 - frac) * s1 + frac * s2;
    outSamples[i] = Math.max(-32768, Math.min(32767, Math.round(interpolated)));
  }
  return outSamples;
}

// PCM16 → μ-law 8-bit (Twilio expects μ-law)
function pcm16ToMuLaw8(pcm16) {
  const MULAW_MAX = 0x1fff;
  const MULAW_BIAS = 33;
  const output = new Uint8Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    let sample = pcm16[i];
    let sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > MULAW_MAX) sample = MULAW_MAX;
    sample += MULAW_BIAS;
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) exponent--;
    let mantissa = (sample >> (exponent + 3)) & 0x0f;
    output[i] = ~(sign | (exponent << 4) | mantissa);
  }
  return output;
}

// Extract audio base64 from OpenAI event
function extractAudioBase64(event) {
  if (!event) return null;
  if (event.delta?.audio) return event.delta.audio;
  if (event.output_audio) return event.output_audio;
  if (Array.isArray(event.content)) {
    for (const c of event.content) {
      if (c?.audio) return c.audio;
    }
  }
  return null;
}

export function setupRealtime(app) {
  app.ws("/realtime", async (ws) => {
    console.log("✅ Twilio WebSocket connected → starting realtime conversation");

    // 1️⃣ Get ephemeral client secret
    const resp = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const keyData = await resp.json();
    console.log("🔑 OpenAI ephemeral key received");

    const ephemeralKey =
      keyData?.client_secret?.value ||
      keyData?.value ||
      keyData?.session?.client_secret?.value ||
      keyData?.session?.value;

    if (!ephemeralKey) {
      console.error("❌ No ephemeral key found, closing WebSocket");
      ws.close();
      return;
    }

    // 2️⃣ Connect to OpenAI Realtime WS
    const openAIWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview&voice=alloy",
      { headers: { Authorization: `Bearer ${ephemeralKey}` } }
    );

    openAIWs.on("open", () => {
      console.log("🔗 Connected to OpenAI Realtime WebSocket");

      // Force greeting instantly
      openAIWs.send(
        JSON.stringify({
          type: "response.create",
          response: {
            instructions: "Hello! This is Finlumina Vox speaking instantly as the call connects.",
          },
        })
      );
    });

    // Handle OpenAI events
    openAIWs.on("message", (msg) => {
      let event;
      try {
        event = JSON.parse(msg.toString());
      } catch {
        return;
      }

      if (event.type === "error") {
        console.error("❌ OpenAI error:", event.error?.message || "Unknown error");
        return;
      }

      switch (event.type) {
        case "response.output_audio.delta": {
          const audioB64 = extractAudioBase64(event);
          if (!audioB64) break;

          try {
            const pcm24 = new Int16Array(Buffer.from(audioB64, "base64").buffer);
            const pcm8 = resample24kTo8k(pcm24);
            const muLaw8 = pcm16ToMuLaw8(pcm8);

            ws.send(
              JSON.stringify({
                event: "media",
                media: { payload: Buffer.from(muLaw8).toString("base64") },
              })
            );
          } catch {
            console.error("❌ Error processing audio chunk");
          }
          break;
        }

        case "response.output_text.delta":
          // Non-spammy partial text log
          console.log("💬 OpenAI speaking…");
          break;

        case "response.output_text.completed":
          console.log("💬 OpenAI finished speaking");
          break;

        case "response.done":
          console.log("📩 OpenAI response done");
          break;

        default:
          break;
      }
    });

    openAIWs.on("error", (err) => {
      console.error("❌ OpenAI WebSocket transport error:", err.message);
    });

    // 3️⃣ Twilio → OpenAI audio
    let forwardedChunkCount = 0;
    ws.on("message", (msg) => {
      try {
        const data = typeof msg === "string" ? JSON.parse(msg) : msg;

        if (data.event === "media" && data.media?.payload && openAIWs.readyState === 1) {
          const buffer8k = Buffer.from(data.media.payload, "base64");
          const pcm8 = new Int16Array(buffer8k.buffer, buffer8k.byteOffset, buffer8k.length / 2);
          const buffer24k = resampleTo24k(pcm8);

          forwardedChunkCount++;
          if (forwardedChunkCount % 10 === 0) {
            console.log(`🎙️ Forwarded audio chunk #${forwardedChunkCount}`);
          }

          openAIWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: Buffer.from(buffer24k.buffer).toString("base64"),
            })
          );
        }

        if (data.event === "stop") {
          openAIWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          openAIWs.send(JSON.stringify({ type: "response.create" }));
          forwardedChunkCount = 0;
        }
      } catch {
        console.error("❌ Error parsing Twilio audio message");
      }
    });

    ws.on("close", () => {
      console.log("⚠️ Twilio WebSocket disconnected");
      if (openAIWs) openAIWs.close();
    });
  });
}