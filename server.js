// server.js
import express from "express";
import bodyParser from "body-parser";
import expressWs from "express-ws";

import voiceRouter from "./routes/voice.js";
import realtimeConversation from "./services/realtime-conversation.js";

const app = express();
expressWs(app); // enable WebSocket support

app.use(bodyParser.json());

// Voice route (TwiML generator)
app.use("/voice", voiceRouter);

// Realtime conversation WebSocket
app.ws("/realtime-conversation", realtimeConversation);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});