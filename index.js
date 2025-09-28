import express from "express";
import fetch from "node-fetch";
import twilio from "twilio";

const app = express();

app.post("/voice", async (req, res) => {
  // Fetch ephemeral key
  const sessionResp = await fetch("http://localhost:3000/session");
  const sessionData = await sessionResp.json();

  const ephemeralKey = sessionData.client_secret?.value;
  if (!ephemeralKey) {
    return res.status(500).send("No ephemeral key");
  }

  // Build WebSocket URL with query params
  const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17&authorization=Bearer%20${encodeURIComponent(ephemeralKey)}&openai-beta=realtime=v1`;

  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  connect.stream({ url: wsUrl });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.listen(3001, () => {
  console.log("TwiML app running on port 3001");
});