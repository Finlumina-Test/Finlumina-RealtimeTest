import express from "express";
import fetch from "node-fetch";

const app = express();

// Endpoint to get ephemeral key for Twilio
app.get("/session", async (req, res) => {
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "verse",
      }),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error creating session:", err);
    res.status(500).send("Failed to create session");
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});