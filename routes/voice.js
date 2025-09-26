import express from "express";
const router = express.Router();

router.post("/", (req, res) => {
  const host = req.headers["host"];
  const wsUrl = `wss://${host}/realtime-conversation`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Starting realtime conversation...</Say>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`;

  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

export default router;
