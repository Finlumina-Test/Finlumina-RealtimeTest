// routes/voice.js
import express from "express";
import { getEphemeralKey } from "../services/openai.js";

const router = express.Router();

// Endpoint Twilio will call when someone dials in
router.post("/voice", async (req, res) => {
  try {
    const { value: ephemeralKey } = await getEphemeralKey();

    const twiml = `
      <Response>
        <Connect>
          <Stream url="wss://${process.env.RENDER_EXTERNAL_HOSTNAME}/realtime-conversation/.websocket">
            <Parameter name="ephemeralKey" value="${ephemeralKey}" />
          </Stream>
        </Connect>
      </Response>
    `;

    res.type("text/xml");
    res.send(twiml);
    console.log("✅ Sent TwiML to Twilio");
  } catch (err) {
    console.error("❌ Error generating TwiML:", err);
    res.status(500).send("Error generating TwiML");
  }
});

export default router;