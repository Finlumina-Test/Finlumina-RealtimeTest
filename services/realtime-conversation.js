// services/realtime-conversation.js
import fetch from "node-fetch";
import WebSocket from "ws";

// 8k → 16k resample helper
function resample8to16(buffer8k) {
  const inSamples = new Int16Array(buffer8k.buffer);
  const outSamples = new Int16Array(inSamples.length * 2);
  for (let i = 0; i < inSamples.length; i++) {
    outSamples[i * 2] = inSamples[i];
    outSamples[i * 2 + 1] = inSamples[i];
  }
  return outSamples;
}

// PCM16 → μ-law 8-bit
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
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) exponent--;
    let mantissa = (sample >> (exponent + 3)) & 0x0f;
    output[i] = ~(sign | (exponent << 4) | mantissa);
  }

  return output;
}

export function setupRealtime(app) {
  app.ws("/realtime", async (ws) => {
    console.log("✅ Twilio WebSocket connected → starting realtime conversation");

    try {
      // 1️⃣ Request ephemeral client secret from OpenAI
      const resp = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}), // empty body, no model param
      });

      const keyData = await resp.json();
      console.log("🔑 OpenAI client secret response:", JSON.stringify(keyData, null, 2));

      if (!keyData.client_secret?.value) {
        console.error("❌ No ephemeral key found, closing WebSocket");
        ws.close();
        return;
      }

      const ephemeralKey = keyData.client_secret.value;

      // 2️⃣ Connect to OpenAI Realtime GA session
      const openAIWs = new WebSocket(
        "wss://api.openai.com/v1/realtime?model=gpt-realtime&voice=verse",
        { headers: { Authorization: `Bearer ${ephemeralKey}` } }
      );

      openAIWs.on("open", () => {
        console.log("✅ Connected to OpenAI Realtime");

        // 3️⃣ Send an initial greeting so user hears something immediately
        openAIWs.send(JSON.stringify({
          type: "input_text",
          text: "Hello! I am Finlumina, your AI financial assistant. How can I help you today?"
        }));
      });

      // 4️⃣ Handle OpenAI messages
      openAIWs.on("message", (msg) => {
        const resp = JSON.parse(msg.toString());

        switch (resp.type) {
          case "response.output_audio.delta":
            const pcm16 = new Int16Array(Buffer.from(resp.audio, "base64").buffer);
            const muLaw8 = pcm16ToMuLaw8(pcm16);
            ws.send(JSON.stringify({
              type: "media",
              media: Buffer.from(muLaw8).toString("base64")
            }));
            break;

          case "response.output_text.delta":
            console.log("💬 Partial text:", resp.delta);
            break;

          case "response.output_text.completed":
            console.log("💬 Final text:", resp.text);
            break;

          case "session.created":
            console.log("📩 OpenAI event: session.created");
            break;

          default:
            console.log("📩 OpenAI event:", resp.type);
        }
      });

      openAIWs.on("error", (err) => {
        console.error("❌ OpenAI Realtime error:", err);
      });

      openAIWs.on("close", () => {
        console.log("⚠️ OpenAI Realtime WebSocket closed");
      });

      // 5️⃣ Forward Twilio audio → OpenAI
      ws.on("message", (msg) => {
        try {
          const data = JSON.parse(msg);
          if (data.type === "input_audio_buffer" && openAIWs.readyState === 1) {
            const buffer8k = new Int16Array(Buffer.from(data.audio, "base64").buffer);
            const buffer16k = resample8to16(buffer8k);
            console.log(`🎙️ Forwarding audio: ${buffer8k.length} → ${buffer16k.length}`);
            openAIWs.send(JSON.stringify({
              type: "input_audio_buffer",
              audio: Buffer.from(buffer16k).toString("base64"),
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

    } catch (err) {
      console.error("❌ Error setting up Realtime session:", err);
      ws.close();
    }
  });
}