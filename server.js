import express from "express";
import bodyParser from "body-parser";
import voiceRoutes from "./routes/voice.js";
import realtimeConversationRoutes from "./services/realtime-conversation.js";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Routes
app.use("/voice", voiceRoutes);
app.use("/realtime-conversation", realtimeConversationRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});