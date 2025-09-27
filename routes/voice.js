// routes/voice.js
import express from "express";
const router = express.Router();

router.post("/voice", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${process.env.SERVER_DOMAIN}/realtime-conversation" track="inbound_track"/>
      </Start>
      <Say>Starting realtime conversation...</Say>
      <Pause length="60"/>
    </Response>
  `;

  res.type("text/xml");
  res.send(twiml);
});

export default router;
