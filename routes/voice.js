// routes/voice.js
import express from "express";
const router = express.Router();

router.post("/", (req, res) => {
  const wsUrl = `wss://${process.env.SERVER_DOMAIN}/realtime-conversation`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Starting realtime conversation...</Say>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track" />
  </Connect>
</Response>`;

  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

export default router;
