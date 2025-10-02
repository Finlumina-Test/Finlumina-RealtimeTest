import express from "express";
import twilio from "twilio";

const router = express.Router();

// Incoming call webhook from Twilio
router.post("/incoming", (req, res) => {
  console.log("📞 Incoming call – creating Twilio <Stream>...");

  const twiml = new twilio.twiml.VoiceResponse();

  // Optional: short greeting
  twiml.say({ voice: "Google.en-US-Wavenet-D" }, "Testing Finlumina Vox.");

  // Build the realtime WebSocket URL
  const wsUrl = `wss://${process.env.RENDER_EXTERNAL_HOSTNAME}/realtime`;
  console.log(`🔗 Sending Twilio Stream URL: ${wsUrl}`);

  // Start realtime stream
  const connect = twiml.connect();
  connect.stream({ url: wsUrl });

  // ✅ Only send XML back — nothing else, no JSON, no logs
  res.type("text/xml");
  res.send(twiml.toString());
});

export default router;