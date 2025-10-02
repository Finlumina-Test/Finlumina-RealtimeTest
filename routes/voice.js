import express from "express";
import twilio from "twilio";

const router = express.Router();

router.post("/incoming", (req, res) => {
  console.log("📞 Incoming call – creating Twilio <Stream>...");

  const twiml = new twilio.twiml.VoiceResponse();

  // Start realtime stream first
  const wsUrl = `wss://${process.env.RENDER_EXTERNAL_HOSTNAME}/realtime`;
  console.log(`🔗 Sending Twilio Stream URL: ${wsUrl}`);
  const connect = twiml.connect();
  connect.stream({ url: wsUrl });

  // Optional: send greeting as a <Say> **inside stream** if needed
  // Otherwise, let AI send greeting so Twilio call stays active

  res.type("text/xml");
  res.send(twiml.toString());
});

export default router;