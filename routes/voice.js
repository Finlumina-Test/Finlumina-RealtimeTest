// routes/voice.js
import express from "express";
import twilio from "twilio";

const router = express.Router();

// Incoming call webhook from Twilio
router.post("/incoming", (req, res) => {
  try {
    console.log("📞 Incoming call – creating Twilio <Stream>...");

    const twiml = new twilio.twiml.VoiceResponse();

    // Build the realtime WebSocket URL (Render provides your public host)
    const wsUrl = `wss://${process.env.RENDER_EXTERNAL_HOSTNAME}/realtime`;
    console.log(`🔗 Sending Twilio Stream URL: ${wsUrl}`);

    // Start realtime stream — no <Say>, only stream
    twiml.connect().stream({ url: wsUrl });

    // ✅ Always return TwiML
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("❌ Error in /voice/incoming:", err);

    // Fail-safe: return empty <Response/> so Twilio doesn't error out
    res.type("text/xml").send("<Response/>");
  }
});

export default router;