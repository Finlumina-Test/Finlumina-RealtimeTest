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
      voice: "Google.en-US-Wavenet-D" // You can change this to any Google/Amazon Polly voice
    },
    "Testing Finlumina Vox."
  );

  // Start realtime stream
  const connect = twiml.connect();
  connect.stream({ url: `${process.env.PUBLIC_SERVER_URL}/realtime-conversation` });

  res.type("text/xml");
  res.send(twiml.toString());
});

export default router;