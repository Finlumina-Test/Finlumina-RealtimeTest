// services/realtime-conversation.js
import fetch from "node-fetch";
import WebSocket from "ws";

function resample8to16(buffer8k) {
  const inSamples = new Int16Array(buffer8k.buffer);
  const outSamples = new Int16Array(inSamples.length * 2);
  for (let i = 0; i < inSamples.length; i++) {
    outSamples[i * 2] = inSamples[i];
    outSamples[i * 2 + 1] = inSamples[i];
  }
  return outSamples;
}

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

    // 🔑 Create a realtime session with OpenAI
    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-realtime-preview-2024-12-17", // 🔥 use full model name
        voice: "verse",
      }),
    });

    const keyData = await resp.json();
    if (!keyData.client_secret?.value) {
      console.error("❌ Failed to get OpenAI session key:", keyData);
      ws.close();
      return;
    }

    const openAIWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-realtime-preview-2024-12-17",
      { headers: { Authorization: `Bearer ${keyData.client_secret.value}` } }
    );

    // OpenAI → Twilio
    openAIWs.on("message", (msg) => {
      const resp = JSON.parse(msg.toString());

      if (resp.type === "error") {
        console.error("❌ OpenAI Realtime error:", JSON.stringify(resp, null, 2));
        return;
      }

      switch (resp.type) {
        case "response.output_audio.delta":
          const pcm16 = new Int16Array(Buffer.from(resp.delta, "base64").buffer);
          const muLaw8 = pcm16ToMuLaw8(pcm16);
          ws.send(JSON.stringify({
            event: "media",
            media: Buffer.from(muLaw8).toString("base64"),
          }));
          break;

        case "response.output_text.delta":
          console.log("💬 Partial text:", resp.delta);
          break;

        case "response.completed":
          console.log("💬 Final response:", JSON.stringify(resp, null, 2));
          break;

        default:
          console.log("📩 OpenAI event:", resp.type);
      }
    });

    // Twilio → OpenAI
    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.event === "media" && openAIWs.readyState === 1) {
          const buffer8k = new Int16Array(Buffer.from(data.media, "base64").buffer);
          const buffer16k = resample8to16(buffer8k);

          openAIWs.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: Buffer.from(buffer16k).toString("base64"),
          }));
        }

        if (data.event === "mark") {
          openAIWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          openAIWs.send(JSON.stringify({ type: "response.create" }));
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