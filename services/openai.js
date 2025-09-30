import WebSocket from "ws";
import fetch from "node-fetch";

const OPENAI_REALTIME_MODEL = "gpt-4o-realtime-preview-2024-09"; // ✅ latest available

/**
 * Create a new ephemeral key from OpenAI.
 * This key is short-lived and used for each Twilio connection.
 */
async function getEphemeralKey() {
  const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_REALTIME_MODEL,
      voice: "verse" // can be changed
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to create ephemeral key: ${text}`);
  }

  return resp.json();
}

/**
 * Handles forwarding Twilio WebSocket messages to OpenAI Realtime
 * and relaying responses back.
 */
export async function handleRealtimeConversation(ws, message) {
  if (!ws.openaiSocket) {
    console.log("🔑 Creating ephemeral session with OpenAI...");

    const session = await getEphemeralKey();

    const openaiSocket = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=" + OPENAI_REALTIME_MODEL,
      {
        headers: {
          Authorization: `Bearer ${session.client_secret.value}`,
          "OpenAI-Beta": "realtime=v1"
        }
      }
    );

    ws.openaiSocket = openaiSocket;

    // Pipe messages from OpenAI → Twilio
    openaiSocket.on("message", (data) => {
      ws.send(data);
    });

    openaiSocket.on("open", () => {
      console.log("✅ Connected to OpenAI Realtime");
    });

    openaiSocket.on("close", () => {
      console.log("❌ OpenAI Realtime disconnected");
    });
  }

  // Forward Twilio message to OpenAI
  if (ws.openaiSocket && ws.openaiSocket.readyState === WebSocket.OPEN) {
    ws.openaiSocket.send(message);
  }
}