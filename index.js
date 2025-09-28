import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// TwiML response for incoming call
app.post("/voice", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Connect>
        <Stream url="wss://${process.env.RENDER_EXTERNAL_HOSTNAME}/voice" />
      </Connect>
    </Response>
  `);
});

// Create server + WebSocket
const server = app.listen(process.env.PORT || 3001, () =>
  console.log("Server running")
);

const wss = new WebSocketServer({ server, path: "/voice" });

wss.on("connection", (ws) => {
  console.log("✅ Twilio WebSocket connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log("Received from Twilio:", data);
    } catch (err) {
      console.error("❌ Non-JSON message:", msg.toString());
    }
  });

  ws.on("close", () => console.log("❌ Twilio WebSocket closed"));
});