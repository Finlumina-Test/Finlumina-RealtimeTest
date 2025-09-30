import { handleRealtimeConversation } from "./openai.js";

/**
 * WebSocket handler for Twilio ↔ OpenAI Realtime.
 * Each inbound Twilio WebSocket gets piped through here.
 */
export default function realtimeConversation(ws, req) {
  console.log("✅ Twilio WebSocket connected");

  ws.on("message", async (message) => {
    try {
      await handleRealtimeConversation(ws, message);
    } catch (err) {
      console.error("Realtime error:", err);
      ws.send(JSON.stringify({ error: "Realtime processing failed" }));
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio WebSocket disconnected");
  });
}