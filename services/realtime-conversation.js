// services/realtime-conversation.js
import WebSocket from "ws";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default function setupRealtimeConversation(server) {
  const wss = new WebSocket.Server({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/realtime-conversation") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", async (twilioWs) => {
    console.log("📞 Twilio stream connected");

    // Connect to OpenAI Realtime API
    const openaiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12",
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1", // important
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
        const audioB64 = data.media.payload;
        const payload = JSON.stringify({
          type: "input_audio_buffer.append",
          audio: audioB64,
        });

        if (openaiReady) {
          openaiWs.send(payload);
        } else {
          messageQueue.push(payload);
        }
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

    // OpenAI → logs (later you can stream audio back)
    openaiWs.on("message", (raw) => {
      const event = JSON.parse(raw.toString());
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
