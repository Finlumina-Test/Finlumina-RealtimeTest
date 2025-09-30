// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import voiceRoutes from "./routes/voice.js";
import realtimeConversation from "./services/realtime-conversation.js";

const app = express();
app.use(express.json());

// Mount the /voice route
app.use("/", voiceRoutes);

const server = http.createServer(app);

// Attach WS server
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/realtime-conversation/.websocket") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      realtimeConversation(ws, req);
    });
  } else {
    socket.destroy();
  }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});