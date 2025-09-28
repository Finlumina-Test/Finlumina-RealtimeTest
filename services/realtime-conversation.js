// services/realtime-conversation.js
import WebSocket, { WebSocketServer } from "ws";

export default function setupRealtimeBridge(server) {
  const wss = new WebSocketServer({ server, path: "/media-stream" });

  wss.on("connection", (ws, req) => {
    console.log("✅ Twilio WebSocket connected");

    // Get ephemeral key from Twilio <Parameter>
    const urlParams = new URLSearchParams(req.url.split("?")[1]);
    const EPHEMERAL_KEY = urlParams.get("ephemeralKey");

    if (!EPHEMERAL_KEY) {
      console.error("❌ No ephemeral key in request");
      ws.close();
      return;
    }

    // Connect to OpenAI Realtime with correct headers
    const openaiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12",
      {
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    openaiWs.on("open", () => {
      console.log("🔗 Connected to OpenAI Realtime API");
    });

    // Forward Twilio → OpenAI
    ws.on("message", (msg) => {
      try {
        openaiWs.send(msg);
      } catch (err) {
        console.error("❌ Error forwarding to OpenAI:", err);
      }
    });

    // Forward OpenAI → Twilio
    openaiWs.on("message", (msg) => {
      try {
        ws.send(msg);
      } catch (err) {
        console.error("❌ Error forwarding to Twilio:", err);
      }
    });

    // Handle closures
    ws.on("close", () => {
      console.log("❌ Twilio WebSocket closed");
      openaiWs.close();
    });

    openaiWs.on("close", () => {
      console.log("❌ OpenAI WebSocket closed");
      ws.close();
    });

    openaiWs.on("error", (err) => {
      console.error("❌ OpenAI WebSocket error:", err);
      ws.close();
    });
  });
}