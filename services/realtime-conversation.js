// services/realtime-conversation.js
import WebSocket from "ws";

export default function realtimeConversation(ws, req) {
  console.log("✅ Twilio WebSocket connected");

  // Log full incoming URL for debugging
  console.log("Incoming WS URL:", req.url);

  const url = new URL(req.url, `https://${process.env.PUBLIC_DOMAIN}`);
  const ephemeralKey = url.searchParams.get("key");

  if (!ephemeralKey) {
    console.error("❌ No ephemeral key in request", req.url);
    ws.send(JSON.stringify({ error: "Missing ephemeral key" }));
    ws.close();
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