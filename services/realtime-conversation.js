// services/realtime-conversation.js
import WebSocket from "ws";

export default function realtimeConversation(twilioWs) {
  console.log("✅ Twilio WS connected");

  let openAiWs = null;
  let openAiReady = false;
  const openAiQueue = [];

  function connectOpenAI(ephemeralKey) {
    openAiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12",
      {
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    openAiWs.on("open", () => {
      openAiReady = true;
      console.log("🔗 Connected to OpenAI Realtime API");

      // Flush queued audio
      while (openAiQueue.length > 0) {
        openAiWs.send(openAiQueue.shift());
      }

      // Send initial instruction so AI speaks first if needed
      openAiWs.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
            instructions:
              "You are a helpful call agent for Finlumina Vox. Speak clearly, politely, and briefly.",
          },
        })
      );
      console.log("📤 Sent initial response.create to OpenAI");
    });

    openAiWs.on("message", (msg) => {
      try {
        const data = JSON.parse(msg.toString());

        // Forward audio deltas to Twilio
        if (data.type === "response.output_audio.delta" && data.audio) {
          twilioWs.send(
            JSON.stringify({
              event: "media",
              media: { payload: data.audio },
            })
          );
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
  }

  // --- Handle Twilio events ---
  twilioWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.event === "start") {
        const ephemeralKey = data.start.customParameters?.ephemeralKey;
        if (ephemeralKey) {
          console.log("🔑 Ephemeral key received from Twilio");
          connectOpenAI(ephemeralKey);
        } else {
          console.error("❌ No ephemeralKey found in Twilio start event");
        }
      } else if (data.event === "media" && data.media?.payload) {
        const payload = JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload,
        });

        if (openAiReady && openAiWs) {
          openAiWs.send(payload);
        } else {
          openAiQueue.push(payload);
        }
      } else if (data.event === "stop") {
        console.log("⏹️ Twilio stream stopped");
        if (openAiWs) {
          openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          openAiWs.send(JSON.stringify({ type: "response.create" }));
        }
      }
    } catch (err) {
      console.error("❌ Failed to parse Twilio WS message:", err);
    }
  });

  twilioWs.on("close", () => {
    console.log("❌ Twilio WS closed");
    if (openAiWs) openAiWs.close();
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Twilio WS error:", err);
    if (openAiWs) openAiWs.close();
  });
}