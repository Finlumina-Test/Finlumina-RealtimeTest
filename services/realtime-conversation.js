import WebSocket, { WebSocketServer } from "ws";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    // Connect to OpenAI Realtime API
    const openaiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12",
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );

    openaiWs.on("open", () => console.log("🤖 Connected to OpenAI Realtime"));

    // Forward Twilio audio → OpenAI
    twilioWs.on("message", (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.event === "media" && data.media?.payload) {
        const audioB64 = data.media.payload;
        openaiWs.send(
          JSON.stringify({ type: "input_audio_buffer.append", audio: audioB64 })
        );
      }
      if (data.event === "stop") {
        openaiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        openaiWs.send(JSON.stringify({ type: "response.create" }));
      }
    });

    // Forward GPT audio → Twilio
    openaiWs.on("message", (raw) => {
      const event = JSON.parse(raw.toString());

      if (event.type === "response.output_audio.delta" && event.delta) {
        const pcmB64 = event.delta;
        twilioWs.send(
          JSON.stringify({
            event: "media",
            streamSid: "realtime",
            media: { payload: pcmB64 },
          })
        );
      }

      if (event.type === "response.output_text.delta") {
        console.log("GPT says:", event.delta);
      }
    });

    // Cleanup
    twilioWs.on("close", () => {
      console.log("❌ Twilio stream closed");
      openaiWs.close();
    });
    openaiWs.on("close", () => console.log("❌ OpenAI stream closed"));
  });
}
