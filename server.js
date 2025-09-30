import express from "express";
import bodyParser from "body-parser";
import expressWs from "express-ws";
import voiceRoutes from "./routes/voice.js";
import { setupRealtime } from "./services/realtime-conversation.js";

const app = express();
expressWs(app); // Enable WebSocket

// Middleware
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => res.send("🚀 Finlumina Vox server is running"));

// Voice webhook
app.use("/voice", voiceRoutes);

// Realtime WebSocket for Twilio <Stream>
setupRealtime(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});