import express from "express";
import { xml } from "xmlbuilder2";

const router = express.Router();

/**
 * Twilio webhook for inbound calls.
 * Responds with <Connect><Stream> pointing to our WebSocket endpoint.
 */
router.post("/", async (req, res) => {
  try {
    const wsUrl = `wss://${process.env.PUBLIC_DOMAIN}/realtime-conversation`;

    const twiml = xml({
      Response: {
        Connect: {
          Stream: {
            "@url": wsUrl,
            "@track": "inbound_track"
          }
        }
      }
    });

    res.type("text/xml");
    res.send(twiml);
  } catch (err) {
    console.error("Error generating TwiML:", err);
    res.status(500).send("Internal Server Error");
  }
});

export default router;