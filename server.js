// server.js
import express from "express";
import expressWs from "express-ws";
import bodyParser from "body-parser";
import voiceRoutes from "./routes/voice.js";
import { setupRealtime } from "./services/realtime-conversation.js";

const app = express();
expressWs(app); // 🔑 enables app.ws()

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Server is running");
});

// Routes
app.use("/voice", voiceRoutes);

// Setup realtime WebSocket handler
setupRealtime(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});