import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import voiceRoutes from "./routes/voice.js"; // ✅ correct path
import realtimeConversation from "./services/realtime-conversation.js"; // ✅ WebSocket handler
import { WebSocketServer } from "ws";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// REST routes
app.use("/voice", voiceRoutes);

// --- WebSocket server for /realtime-conversation ---
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Public domain: ${process.env.PUBLIC_DOMAIN}`);
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/realtime-conversation") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      realtimeConversation(ws, request);
    });
  } else {
    socket.destroy();
  }
});