import fetch from "node-fetch";

export function setupRealtime(app) {
  app.ws("/realtime", (ws, req) => {
    console.log("✅ Twilio WebSocket connected");

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        // OpenAI ephemeral key request
        if (data.type === "get-ephemeral-key") {
          console.log("🔑 Request for ephemeral key from OpenAI...");

          const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-realtime-preview-2024-12-17",
              voice: "verse", // or your preferred TTS voice
            }),
          });

          const keyData = await resp.json();

          if (keyData.client_secret?.value) {
            ws.send(JSON.stringify({
              type: "ephemeral-key",
              data: keyData.client_secret.value,
            }));
            console.log("✅ Ephemeral key sent to Twilio");
          } else {
            ws.send(JSON.stringify({ type: "error", error: "No ephemeral key returned" }));
            console.error("❌ OpenAI ephemeral key error:", keyData);
          }
        } else {
          console.log("📩 Message from Twilio:", data.type);
          // Here you can handle STT audio chunks, process them, and send back TTS
          // For production, consider streaming to OpenAI Realtime and then sending audio back
        }
      } catch (err) {
        console.error("❌ WebSocket message error:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("⚠️ Twilio WebSocket disconnected");
    });
  });
}