// services/realtime-conversation.js
import WebSocket from "ws";

export default function realtimeConversation(twilioWs, req) {
  console.log("✅ Twilio WS connected");

  let openAiWs = null;
  let openAiReady = false;
  const openAiQueue = [];

  // Smarter logging controls
  let chunkCount = 0;
  let lastLogTime = Date.now();

  // Flush interval (commits audio every ~1s for real-time responses)
  let flushInterval = null;

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

      // Configure session (voice + turn detection)
      openAiWs.send(
        JSON.stringify({
          type: "session.update",
          session: {
            voice: "verse", // choose voice: "verse", "sage", etc.
            turn_detection: { type: "server_vad" },
          },
        })
      );

      // Kick off with an initial response.create
      openAiWs.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
            instructions:
              "You are a helpful call agent for Finlumina Vox. Answer politely and clearly.",
          },
        })
      );
      console.log("📤 Sent initial response.create to OpenAI");

      // Start periodic flushing (commits buffer every second)
      flushInterval = setInterval(() => {
        if (openAiReady && openAiWs?.readyState === WebSocket.OPEN) {
          openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          openAiWs.send(JSON.stringify({ type: "response.create" }));
        }
      }, 1000);
    });

    openAiWs.on("message", (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        // Debug logging only if useful
        if (data.type !== "response.output_audio.delta") {
          console.log("📥 OpenAI →", JSON.stringify(data, null, 2));
        }

        // Forward audio back to Twilio
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
      clearInterval(flushInterval);
      twilioWs.close();
    });

    openAiWs.on("error", (err) => {
      console.error("❌ OpenAI WS error:", err);
      clearInterval(flushInterval);
      twilioWs.close();
    });
  }

  // --- Twilio events ---
  twilioWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.event === "start") {
        console.log("▶️ Twilio stream started:", data.start);

        // Get ephemeral key from customParameters
        const ephemeralKey = data.start.customParameters?.ephemeralKey;
        if (ephemeralKey) {
          console.log("🔑 Ephemeral key received from Twilio:", ephemeralKey);
          connectOpenAI(ephemeralKey);
        } else {
          console.error("❌ No ephemeralKey found in Twilio start event");
        }
      } else if (data.event === "media" && data.media?.payload) {
        const payload = JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload,
        });

        if (openAiReady && openAiWs?.readyState === WebSocket.OPEN) {
          openAiWs.send(payload);
        } else {
          openAiQueue.push(payload);
        }

        // Throttle log (once per sec)
        chunkCount++;
        const now = Date.now();
        if (now - lastLogTime > 1000) {
          console.log(
            `[Twilio → OpenAI] ${chunkCount} audio chunks forwarded in last second`
          );
          chunkCount = 0;
          lastLogTime = now;
        }
      } else if (data.event === "stop") {
        console.log("⏹️ Twilio stream stopped");
        if (openAiWs?.readyState === WebSocket.OPEN) {
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
    clearInterval(flushInterval);
    if (openAiWs) openAiWs.close();
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Twilio WS error:", err);
    clearInterval(flushInterval);
    if (openAiWs) openAiWs.close();
  });
}