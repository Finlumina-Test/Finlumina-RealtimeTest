// services/realtime-conversation.js
import WebSocket from "ws";

export default function realtimeConversation(twilioWs, req) {
  console.log("✅ Twilio WS connected");

  // Extract ephemeral key from query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ephemeralKey = url.searchParams.get("key");

  if (!ephemeralKey) {
    console.error("❌ No ephemeral key in request:", req.url);
    twilioWs.close();
    return;
  }

  // Connect to OpenAI Realtime API
  const openAiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12",
    {
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  let openAiReady = false;
  const openAiQueue = [];

  // Smarter logging controls
  let chunkCount = 0;
  let lastLogTime = Date.now();

  // --- OpenAI events ---
  openAiWs.on("open", () => {
    openAiReady = true;
    console.log("🔗 Connected to OpenAI Realtime API");

    // Flush queued audio
    while (openAiQueue.length > 0) {
      openAiWs.send(openAiQueue.shift());
    }

    // Tell OpenAI to start generating responses
    openAiWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text", "audio"],
          instructions: "You are a helpful call agent for Finlumina Vox. Answer politely and clearly.",
        },
      })
    );
    console.log("📤 Sent initial response.create to OpenAI");
  });

  openAiWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log("📥 OpenAI → Twilio:", JSON.stringify(data, null, 2));

      // Forward audio output (if any) back to Twilio
      if (data.type === "response.output_audio.delta" && data.audio) {
        const twilioMsg = JSON.stringify({
          event: "media",
          media: { payload: data.audio },
        });
        twilioWs.send(twilioMsg);
      }
    } catch (err) {
      console.error("❌ Failed to parse OpenAI message:", err);
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

  // --- Twilio events ---
  twilioWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.event === "media" && data.media?.payload) {
        // Wrap Twilio audio into OpenAI input format
        const payload = JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload,
        });

        if (openAiReady) {
          openAiWs.send(payload);
        } else {
          openAiQueue.push(payload);
        }

        // Smarter logging: show once per second
        chunkCount++;
        const now = Date.now();
        if (now - lastLogTime > 1000) {
          console.log(`[Twilio → OpenAI] ${chunkCount} audio chunks forwarded in last second`);
          chunkCount = 0;
          lastLogTime = now;
        }
      } else if (data.event === "start") {
        console.log("▶️ Twilio stream started:", data.start);
      } else if (data.event === "stop") {
        console.log("⏹️ Twilio stream stopped");
        openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        openAiWs.send(JSON.stringify({ type: "response.create" }));
      }
    } catch (err) {
      console.error("❌ Failed to parse Twilio WS message:", err);
    }
  });

  twilioWs.on("close", () => {
    console.log("❌ Twilio WS closed");
    openAiWs.close();
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Twilio WS error:", err);
    openAiWs.close();
  });
}