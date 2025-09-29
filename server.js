// server.js
import express from "express";
import bodyParser from "body-parser";
import expressWs from "express-ws";

import voiceRouter from "./routes/voice.js";
import realtimeConversation from "./services/realtime-conversation.js";

const app = express();
expressWs(app);

app.use(bodyParser.json());

// Twilio voice route
app.use("/voice", voiceRouter);

// WebSocket for Twilio <Stream>
app.ws("/realtime-conversation", realtimeConversation);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));