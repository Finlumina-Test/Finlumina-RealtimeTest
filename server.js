import express from "express";
import bodyParser from "body-parser";
import expressWs from "express-ws";
import voiceRoutes from "./routes/voice.js";
import { setupRealtime } from "./services/realtime-conversation.js";

const app = express();
expressWs(app); // enable WebSocket on Express

app.use(bodyParser.json());

// Routes
app.use("/voice", voiceRoutes);

// WebSocket setup
setupRealtime(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});