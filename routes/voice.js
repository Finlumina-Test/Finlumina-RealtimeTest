// routes/voice.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.post("/", async (req, res) => {
  console.log("📞 Incoming call from Twilio → requesting ephemeral key...");

  try {
    // 1. Ask OpenAI for ephemeral key
    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12",
        voice: "verse"
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("❌ Failed to fetch ephemeral key from OpenAI:", err);
      return res.status(500).send("Failed to start realtime session");
    }

    const data = await resp.json();
    const EPHEMERAL_KEY = data.client_secret?.value;

    if (!EPHEMERAL_KEY) {
      console.error("❌ No ephemeral key received in OpenAI response:", data);
      return res.status(500).send("No ephemeral key received");
    }

    console.log("✅ Ephemeral key fetched successfully.");

    // 2. Build TwiML response for Twilio
    console.log("📤 Sending TwiML back to Twilio...");
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Starting realtime conversation...</Say>
  <Connect>
    <Stream url="wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12"
            track="inbound_track">
      <Parameter name="Authorization" value="Bearer ${EPHEMERAL_KEY}" />
      <Parameter name="OpenAI-Beta" value="realtime=v1" />
    </Stream>
  </Connect>
</Response>`;

    res.set("Content-Type", "text/xml");
    res.send(twiml);

    console.log("✅ TwiML sent to Twilio. Realtime stream should now connect to OpenAI.");
  } catch (err) {
    console.error("❌ Error handling /voice route:", err);
    res.status(500).send("Internal Server Error");
  }
});

export default router;