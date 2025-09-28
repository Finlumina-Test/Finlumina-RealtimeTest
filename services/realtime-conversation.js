// services/realtime-conversation.js
import WebSocket from "ws";

export default function realtimeConversation(ws, req) {
  console.log("✅ Twilio WebSocket connected");

  // Grab ephemeral key from query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ephemeralKey = url.searchParams.get("key");

  if (!ephemeralKey) {
    console.error("❌ No ephemeral key in request");
    ws.close();
    return;
  }

  // Connect to OpenAI realtime API
  const openAiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12",
    {
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  openAiWs.on("open", () => {
    console.log("🔗 Connected to OpenAI Realtime API");
  });

  openAiWs.on("message", (msg) => {
    // Forward messages from OpenAI → Twilio
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

  ws.on("message", (msg) => {
    // Forward messages from Twilio → OpenAI
    openAiWs.send(msg);
  });

  ws.on("close", () => {
    console.log("❌ Twilio WS closed");
    openAiWs.close();
  });
}