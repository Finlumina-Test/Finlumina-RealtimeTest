// routes/voice.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    // Request ephemeral key from OpenAI
    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12",
        voice: "verse",
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("❌ Failed to fetch ephemeral key:", err);
      return res.status(500).send("Failed to start realtime session");
    }

    const data = await resp.json();
    const ephemeralKey = data.client_secret?.value;

    if (!ephemeralKey) {
      console.error("❌ No ephemeral key in OpenAI response:", data);
      return res.status(500).send("No ephemeral key received");
    }

    console.log("🔑 Ephemeral key fetched");

    // Use <Parameter> to pass ephemeralKey to Twilio
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Starting realtime conversation...</Say>
  <Connect>
    <Stream url="wss://${req.headers.host}/realtime-conversation">
      <Parameter name="ephemeralKey" value="${ephemeralKey}" />
    </Stream>
  </Connect>
</Response>`;

    res.set("Content-Type", "text/xml");
    res.send(twiml);
    console.log("✅ Sent TwiML to Twilio");
  } catch (err) {
    console.error("❌ Error in /voice route:", err);
    res.status(500).send("Internal Server Error");
  }
});

export default router;