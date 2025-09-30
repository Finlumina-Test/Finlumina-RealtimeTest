import fetch from "node-fetch";

export function setupRealtime(app) {
  app.ws("/realtime", (ws, req) => {
    console.log("✅ Twilio WebSocket connected");

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.type === "get-ephemeral-key") {
          console.log("🔑 Generating ephemeral key from OpenAI...");
          const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-realtime-preview-2024-12-17",
              voice: "verse",
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
            ws.send(JSON.stringify({ type: "error", error: "No ephemeral key in response" }));
            console.error("❌ No ephemeral key in response:", keyData);
          }
        } else {
          console.log("📩 Non-key message received from Twilio:", data.type);
        }
      } catch (err) {
        console.error("❌ Error handling WebSocket message:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("⚠️ Twilio WebSocket closed");
    });
  });
}