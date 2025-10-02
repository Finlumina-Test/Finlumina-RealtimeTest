import express from "express";
import twilio from "twilio";

const router = express.Router();

// Incoming call webhook from Twilio
router.post("/incoming", (req, res) => {
  console.log("📞 Incoming call – creating Twilio <Stream>...");

  const twiml = new twilio.twiml.VoiceResponse();

  // Greeting with Google voice (instead of robotic default)
  twiml.say(
    {
      voice: "Google.en-US-Wavenet-D" // changeable to any Polly/Google voice
    },
    "Testing FinLumina-Vox."
  );

  // Start realtime stream (hardcoded to deployed Render URL)
  const connect = twiml.connect();
  connect.stream({ url: "wss://finlumina-vox.onrender.com/realtime" });

  res.type("text/xml");
  res.send(twiml.toString());
});

export default router;