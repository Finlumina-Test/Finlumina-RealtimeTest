import expressWs from "express-ws";
import WebSocket from "ws";

export default function setupRealtime(server) {
  const { app } = expressWs(server);

  app.ws("/realtime", (ws, req) => {
    console.log("✅ Twilio WebSocket connected");

    const EPHEMERAL_KEY = req.query["ephemeralKey"];
    if (!EPHEMERAL_KEY) {
      console.error("❌ No ephemeral key in request");
      ws.close();
      return;
    }

    // Connect to OpenAI Realtime API
    const openAiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12",
      {
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "OpenAI-Beta": "realtime=v1"
        }
      }
    );

    openAiWs.on("open", () => {
      console.log("🔗 Connected to OpenAI Realtime API");
    });

    openAiWs.on("message", (msg) => {
      console.log("🔊 Message from OpenAI → forwarding to Twilio");
      ws.send(msg);
    });

    openAiWs.on("close", () => {
      console.log("❌ OpenAI connection closed");
      ws.close();
    });

    openAiWs.on("error", (err) => {
      console.error("❌ OpenAI WS error:", err);
      ws.close();
    });

    // Forward Twilio → OpenAI
    ws.on("message", (msg) => {
      console.log("📤 Forwarding audio/media to OpenAI...");
      openAiWs.send(msg);
    });

    ws.on("close", () => {
      console.log("❌ Twilio WebSocket closed");
      openAiWs.close();
    });

    ws.on("error", (err) => {
      console.error("❌ Twilio WS error:", err);
      openAiWs.close();
    });
  });
}