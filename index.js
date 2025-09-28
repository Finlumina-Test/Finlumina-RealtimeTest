// index.js
import express from "express";
import bodyParser from "body-parser";
import voiceRoutes from "./routes/voice.js";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Finlumina Vox Realtime Server is running!");
});

// Twilio webhook → routes/voice.js
app.use("/voice", voiceRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});