// routes/voice.js
import express from "express";

const router = express.Router();

router.post("/", (req, res) => {
  try {
    const host = process.env.PUBLIC_DOMAIN;
    if (!host) {
      console.error("❌ PUBLIC_DOMAIN not set");
      return res.status(500).send("Server misconfigured");
    }

    // TwiML with WebSocket connection
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Starting realtime conversation...</Say>
  <Connect>
    <Stream url="wss://${host}/realtime-conversation" />
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