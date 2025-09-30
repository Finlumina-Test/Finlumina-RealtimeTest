import express from "express";
import bodyParser from "body-parser";
import voiceRoutes from "./routes/voice.js";
import setupRealtime from "./services/realtime-conversation.js";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Finlumina Vox Server is running!");
});

// Voice webhook
app.use("/voice", voiceRoutes);

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Setup realtime WebSocket
setupRealtime(server);