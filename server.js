// server.js
import express from "express";
import bodyParser from "body-parser";
import voiceRoutes from "./routes/voice.js";
import setupRealtimeBridge from "./services/realtime-conversation.js";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Finlumina Vox Realtime Bridge is running!");
});

// Twilio webhook
app.use("/voice", voiceRoutes);

const server = app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});

// Attach Twilio ↔ OpenAI bridge
setupRealtimeBridge(server);