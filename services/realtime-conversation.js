// services/realtime-conversation.js
import fetch from "node-fetch";
import WebSocket from "ws";

// Resample helper (8k → 16k)
function resample8to16(buffer8k) {
  const inSamples = new Int16Array(buffer8k.buffer);
  const outSamples = new Int16Array(inSamples.length * 2);
  for (let i = 0; i < inSamples.length; i++) {
    outSamples[i * 2] = inSamples[i];
    outSamples[i * 2 + 1] = inSamples[i];
  }
  return outSamples;
}

// PCM16 → μ-law 8-bit (Twilio requirement)
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
    console.log("✅ Twilio WebSocket connected → starting realtime conversation");

    let openAIWs;

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        // Ephemeral key request
        if (data.type === "get-ephemeral-key") {
          console.log("🔑 Requesting ephemeral key from OpenAI...");
          const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-realtime",
              voice: "cedar",
            }),
          });

          const keyData = await resp.json();
          if (!keyData.client_secret?.value) {
            console.error("❌ No ephemeral key returned:", keyData);
            ws.send(JSON.stringify({ type: "error", error: "No ephemeral key returned" }));
            return;
          }

          ws.send(JSON.stringify({ type: "ephemeral-key", data: keyData.client_secret.value }));
          console.log("✅ Ephemeral key sent to Twilio");

          // Connect to OpenAI Realtime
          openAIWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime", {
            headers: { Authorization: `Bearer ${keyData.client_secret.value}` },
          });

          openAIWs.on("open", () => console.log("✅ Connected to OpenAI Realtime"));

          openAIWs.on("message", (msg) => {
            const resp = JSON.parse(msg.toString());

            switch (resp.type) {
              case "response.output_text.delta":
                console.log("💬 Partial text:", resp.delta);
                break;
              case "response.output_text.completed":
                console.log("💬 Final text:", resp.text);
                break;
              case "response.output_audio.delta":
                console.log(`🔊 Audio chunk (${resp.audio.length} base64 chars)`);
                {
                  const pcm16 = new Int16Array(Buffer.from(resp.audio, "base64").buffer);
                  const muLaw8 = pcm16ToMuLaw8(pcm16);
                  ws.send(JSON.stringify({
                    type: "media",
                    media: Buffer.from(muLaw8).toString("base64")
                  }));
                }
                break;
              case "response.completed":
                console.log("✅ Response completed");
                break;
              default:
                console.log("📩 OpenAI event:", resp.type);
            }
          });

          openAIWs.on("close", () => console.log("⚠️ OpenAI Realtime closed"));
          openAIWs.on("error", (err) => console.error("❌ OpenAI WS error:", err.message));
        }

        // Twilio sends audio chunks
        if (data.type === "input_audio_buffer") {
          if (openAIWs && openAIWs.readyState === 1) {
            const buffer8k = new Int16Array(Buffer.from(data.audio, "base64").buffer);
            const buffer16k = resample8to16(buffer8k);

            console.log(`🎙️ Forwarding audio: ${buffer8k.length} → ${buffer16k.length} samples`);

            openAIWs.send(JSON.stringify({
              type: "input_audio_buffer",
              audio: Buffer.from(buffer16k).toString("base64"),
            }));
          } else {
            console.warn("⚠️ Dropping audio: OpenAI WS not ready");
          }
        }

        // Text passthrough
        if (data.type === "input_text") {
          if (openAIWs && openAIWs.readyState === 1) {
            console.log("✍️ Forwarding text:", data.text);
            openAIWs.send(JSON.stringify({ type: "input_text", text: data.text }));
          } else {
            console.warn("⚠️ Dropping text: OpenAI WS not ready");
          }
        }

      } catch (err) {
        console.error("❌ Error handling WS message:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("⚠️ Twilio WebSocket disconnected");
      if (openAIWs) openAIWs.close();
    });
  });
}