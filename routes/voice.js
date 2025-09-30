import express from "express";
import twilio from "twilio";
import { createEphemeralKey } from "../services/openai.js";

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

router.post("/voice", async (req, res) => {
  const ephemeralKey = await createEphemeralKey();

  const response = new VoiceResponse();
  const connect = response.connect();

  // Force Twilio to send PCM16 audio @ 16kHz, mono
  connect.stream({
    url: `wss://${req.headers.host}/realtime-conversation`,
    track: "inbound",
    parameters: [
      { name: "ephemeralKey", value: ephemeralKey },
      { name: "audioFormat", value: "pcm16" } // <-- important
    ]
  });

  console.log("✅ Sent TwiML to Twilio");

  res.type("text/xml");
  res.send(response.toString());
});

export default router;