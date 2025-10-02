// services/realtime-conversation.js
import fetch from "node-fetch";
import WebSocket from "ws";

// Resample 16k → 24k PCM16 (for OpenAI)
function resampleTo24k(buffer16k) {
  const inSamples = new Int16Array(buffer16k.buffer);
  const outLength = Math.floor(inSamples.length * 24 / 16);
  const outSamples = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const idx = Math.floor(i * 16 / 24);
    outSamples[i] = inSamples[idx];
  }
  return outSamples;
}

// PCM16 → μ-law 8-bit for Twilio streaming
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

export function setupRealtime(app) {
  app.ws("/realtime", async (ws) => {
    console.log("✅ Twilio WebSocket connected → starting realtime conversation");

    // 1️⃣ Use client_secrets instead of sessions
    let keyData;
    try {
      const resp = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview",
          voice: "alloy",
          modalities: ["audio", "text"],
        }),
      });
      keyData = await resp.json();
      console.log("🔑 OpenAI client secret response:", keyData);
    } catch (err) {
      console.error("❌ Error fetching OpenAI client secret:", err);
      ws.close();
      return;
    }

    const ephemeralKey = keyData.client_secret?.value;
    if (!ephemeralKey) {
      console.error("❌ No ephemeral key found, closing WebSocket");
      ws.close();
      return;
    }

    // 2️⃣ Connect to the GA realtime endpoint
    const openAIWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview&voice=alloy",
      { headers: { Authorization: `Bearer ${ephemeralKey}` } }
    );

    openAIWs.on("open", () => {
      console.log("🔗 Connected to OpenAI Realtime WebSocket");
    });

    openAIWs.on("message", (msg) => {
      const resp = JSON.parse(msg.toString());

      switch (resp.type) {
        case "response.output_audio.delta":
          const pcm16 = new Int16Array(Buffer.from(resp.audio, "base64").buffer);
          const muLaw8 = pcm16ToMuLaw8(pcm16);
          ws.send(JSON.stringify({
            type: "media",
            media: Buffer.from(muLaw8).toString("base64"),
          }));
          break;

        case "response.output_text.delta":
          console.log("💬 Partial text:", resp.delta);
          break;

        case "response.output_text.completed":
          console.log("💬 Final text:", resp.text);
          break;

        case "error":
          console.error("⚠️ OpenAI Error Event:", JSON.stringify(resp, null, 2));
          break;

        default:
          console.log("📩 OpenAI event:", resp.type);
      }
    });

    openAIWs.on("error", (err) => {
      console.error("❌ OpenAI Realtime error:", err);
    });

    // 3️⃣ Forward Twilio audio → OpenAI
    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === "input_audio_buffer" && openAIWs.readyState === 1) {
          const buffer16k = new Int16Array(Buffer.from(data.audio, "base64").buffer);
          const buffer24k = resampleTo24k(buffer16k);
          console.log(`🎙️ Forwarding audio: ${buffer16k.length} → ${buffer24k.length}`);
          openAIWs.send(JSON.stringify({
            type: "input_audio_buffer",
            audio: Buffer.from(buffer24k).toString("base64"),
          }));
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