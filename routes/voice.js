// routes/voice.js
import express from "express";
import twilio from "twilio";

const router = express.Router();

// Incoming call webhook from Twilio
router.post("/incoming", (req, res) => {
  try {
    console.log("📞 Incoming call – creating Twilio <Stream>...");

    const twiml = new twilio.twiml.VoiceResponse();

    // Optional: short greeting
    twiml.say({ voice: "Google.en-US-Wavenet-D" }, "Testing Finlumina Vox.");

    // Build the realtime WebSocket URL
    const wsUrl = `wss://${process.env.RENDER_EXTERNAL_HOSTNAME}/realtime`;
    console.log(`🔗 Sending Twilio Stream URL: ${wsUrl}`);

    // Start realtime stream
    twiml.connect().stream({ url: wsUrl });

    // ✅ Always send back TwiML only
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("❌ Error in /voice/incoming:", err);

    // Fail-safe: return empty <Response/> so Twilio never gets junk
    res.type("text/xml").send("<Response/>");
  }
});

export default router;