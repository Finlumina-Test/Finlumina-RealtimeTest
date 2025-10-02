import express from "express";
import http from "http";
import voiceRoutes from "./routes/voice.js";
import { setupRealtime } from "./services/realtime-conversation.js";

const app = express();
const server = http.createServer(app);

// Health check
app.get("/", (req, res) => {
  res.send("✅ Server is running");
});

// Twilio voice webhook
app.use("/voice", voiceRoutes);

// Setup OpenAI Realtime bridge
setupRealtime(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});