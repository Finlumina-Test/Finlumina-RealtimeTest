// services/realtime-conversation.js
import fetch from "node-fetch";
import WebSocket from "ws";

// Resample 8k → 24k PCM16 (Twilio -> OpenAI expects 24k)
function resampleTo24k(buffer8k) {
  const inSamples = new Int16Array(buffer8k.buffer);
  const inLen = inSamples.length;
  if (inLen === 0) return new Int16Array(0);
  const outLen = Math.floor(inLen * 24 / 8); // usually 3x
  const outSamples = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    // map output sample to fractional input index
    const srcPos = (i * (inLen - 1)) / Math.max(outLen - 1, 1);
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s1 = inSamples[idx] || 0;
    const s2 = inSamples[Math.min(idx + 1, inLen - 1)] || 0;
    // linear interpolation and clamp
    const interpolated = (1 - frac) * s1 + frac * s2;
    outSamples[i] = Math.max(-32768, Math.min(32767, Math.round(interpolated)));
  }
  return outSamples;
}

// Resample 24k → 8k PCM16 (OpenAI -> Twilio expects 8k μ-law)
function resample24kTo8k(buffer24k) {
  const inSamples = new Int16Array(buffer24k.buffer);
  const inLen = inSamples.length;
  if (inLen === 0) return new Int16Array(0);
  const outLen = Math.floor(inLen * 8 / 24); // usually 1/3
  const outSamples = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    // map output sample to fractional input index
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

// Convert PCM16 → μ-law 8-bit (Twilio expects this for streaming)
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
    for (
      let expMask = 0x4000;
      (sample & expMask) === 0 && exponent > 0;
      expMask >>= 1
    )
      exponent--;
    let mantissa = (sample >> (exponent + 3)) & 0x0f;
    output[i] = ~(sign | (exponent << 4) | mantissa);
  }
  return output;
}

export function setupRealtime(app) {
  app.ws("/realtime", async (ws) => {
    console.log("✅ Twilio WebSocket connected → starting realtime conversation");

    // 1️⃣ Get ephemeral client secret (GA endpoint - body intentionally empty)
    const resp = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}), // must be empty for GA client_secrets
    });

    const keyData = await resp.json();
    console.log("🔑 OpenAI client secret response:", keyData);

    // ====== Accept multiple response shapes ==========
    const ephemeralKey =
      keyData?.client_secret?.value ||
      keyData?.value ||
      keyData?.session?.client_secret?.value ||
      keyData?.session?.value;
    // ==================================================

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

      // Force model to speak immediately so we verify audio path
      openAIWs.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions: "Hello! This is Finlumina Vox connected successfully.",
          },
        })
      );
    });

    openAIWs.on("message", (msg) => {
      let event;
      try {
        event = JSON.parse(msg.toString());
      } catch (err) {
        console.error("❌ Failed to parse OpenAI message:", msg.toString(), err);
        return;
      }

      if (event.type === "error") {
        console.error("❌ OpenAI Realtime error:", JSON.stringify(event, null, 2));
        return;
      }

      switch (event.type) {
        case "response.output_audio.delta": {
          // OpenAI outputs PCM16 at 24kHz — resample to 8kHz for Twilio then μ-law
          const pcm24 = new Int16Array(Buffer.from(event.audio, "base64").buffer);
          const pcm8 = resample24kTo8k(pcm24);
          const muLaw8 = pcm16ToMuLaw8(pcm8);
          ws.send(
            JSON.stringify({
              type: "media",
              media: Buffer.from(muLaw8).toString("base64"),
            })
          );
          break;
        }

        case "response.output_text.delta":
          console.log("💬 Partial text:", event.delta);
          break;

        case "response.output_text.completed":
          console.log("💬 Final text:", event.text);
          break;

        default:
          console.log("📩 OpenAI event:", event.type);
      }
    });

    openAIWs.on("error", (err) => {
      console.error("📩 OpenAI WebSocket transport error:", err);
    });

    // 3️⃣ Twilio → OpenAI audio
    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === "input_audio_buffer" && openAIWs.readyState === 1) {
          // Twilio audio is μ-law by default. The Twilio Media Stream gives you base64 PCM16 LE at 8000Hz
          // (your code already created Int16Array from data.audio). Treat that as 8k input:
          const buffer8k = new Int16Array(Buffer.from(data.audio, "base64").buffer);
          const buffer24k = resampleTo24k(buffer8k);
          console.log(`🎙️ Forwarding audio: ${buffer8k.length} → ${buffer24k.length}`);
          openAIWs.send(
            JSON.stringify({
              type: "input_audio_buffer",
              audio: Buffer.from(buffer24k).toString("base64"),
            })
          );
        }
      } catch (err) {
        console.error("❌ Error parsing Twilio message:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("⚠️ Twilio WebSocket disconnected");
      if (openAIWs) openAIWs.close();
    });
  });
}