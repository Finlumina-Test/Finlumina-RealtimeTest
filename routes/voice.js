import express from "express";
import twilio from "twilio";

const router = express.Router();

router.post("/incoming", (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  console.log("📞 Incoming call – connecting Twilio <Stream> to WebSocket...");

  // Connect Twilio call audio to your Render WebSocket endpoint
  twiml.connect().stream({
    url: `wss://${process.env.RENDER_EXTERNAL_HOSTNAME}/realtime`
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

export default router;