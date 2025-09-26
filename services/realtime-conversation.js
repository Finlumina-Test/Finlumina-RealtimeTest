// services/realtime-conversation.js
import { WebSocketServer } from "ws";

export function setupRealtime(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/realtime-conversation") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", async (twilioWs) => {
    console.log("📞 Twilio stream connected");

    // Connect to OpenAI Realtime API (with audio output enabled)
    const openaiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12&voice=verse",
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    let openaiReady = false;
    const messageQueue = [];

    openaiWs.on("open", () => {
      console.log("🤖 Connected to OpenAI Realtime");
      openaiReady = true;

      // Flush queued Twilio messages
      while (messageQueue.length > 0) {
        openaiWs.send(messageQueue.shift());
      }
    });

    // Twilio → OpenAI
    twilioWs.on("message", (msg) => {
      const data = JSON.parse(msg.toString());

      if (data.event === "media" && data.media.payload) {
        const payload = JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload,
        });
        if (openaiReady) openaiWs.send(payload);
        else messageQueue.push(payload);
      }

      if (data.event === "stop") {
        const commit = JSON.stringify({ type: "input_audio_buffer.commit" });
        const create = JSON.stringify({ type: "response.create" });
        if (openaiReady) {
          openaiWs.send(commit);
          openaiWs.send(create);
        } else {
          messageQueue.push(commit, create);
        }
      }
    });

    // OpenAI → Twilio
    openaiWs.on("message", (raw) => {
      const event = JSON.parse(raw.toString());

      // Forward GPT audio to Twilio
      if (event.type === "response.output_audio.delta" && event.delta) {
        const audioPayload = JSON.stringify({
          event: "media",
          streamSid: "gpt_stream", // Twilio expects a streamSid
          media: { payload: event.delta },
        });
        twilioWs.send(audioPayload);
      }

      // Optional: also log GPT text
      if (event.type === "response.output_text.delta") {
        console.log("GPT text:", event.delta);
      }
      if (event.type === "response.completed") {
        console.log("✅ GPT turn completed");
      }
    });

    // Cleanup
    twilioWs.on("close", () => {
      console.log("❌ Twilio closed");
      openaiWs.close();
    });
    openaiWs.on("close", () => console.log("❌ OpenAI closed"));
  });
}
