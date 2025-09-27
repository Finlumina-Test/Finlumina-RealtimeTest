// services/realtime-conversation.js
import { WebSocketServer } from "ws";
import WebSocket from "ws"; // for client → OpenAI
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default function setupRealtime(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/realtime-conversation") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", async (twilioWs) => {
    console.log("📞 Twilio stream connected");

    // Connect to OpenAI Realtime API
    const openaiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12",
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    let openaiReady = false;
    const messageQueue = [];
    let commitInterval = null;

    openaiWs.on("open", () => {
      console.log("🤖 Connected to OpenAI Realtime");
      openaiReady = true;

      // Flush queued messages
      while (messageQueue.length > 0) {
        openaiWs.send(messageQueue.shift());
      }

      // Ask for audio + text output
      openaiWs.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
            instructions: "You are a helpful AI assistant on a phone call.",
            audio: { format: "mulaw", sample_rate: 8000 },
          },
        })
      );

      // 🔁 Periodically commit audio buffer so OpenAI responds mid-call
      commitInterval = setInterval(() => {
        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          openaiWs.send(JSON.stringify({ type: "response.create" }));
          console.log("🟢 Sent commit + response request to OpenAI");
        }
      }, 500);
    });

    // Twilio → OpenAI
    twilioWs.on("message", (msg) => {
      let data;
      try {
        data = JSON.parse(msg.toString());
      } catch (err) {
        console.error("❌ Failed to parse Twilio message:", msg.toString());
        return;
      }

      console.log("Twilio event:", data.event);

      if (data.event === "media" && data.media.payload) {
        console.log("🎤 Got audio frame from Twilio");
        const payload = JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload,
        });

        if (openaiReady) {
          console.log("➡️ Forwarding audio frame to OpenAI");
          openaiWs.send(payload);
        } else {
          messageQueue.push(payload);
        }
      }

      if (data.event === "stop") {
        console.log("⏹️ Twilio sent stop");
        const commit = JSON.stringify({ type: "input_audio_buffer.commit" });
        const create = JSON.stringify({ type: "response.create" });

        if (openaiReady) {
          openaiWs.send(commit);
          openaiWs.send(create);
        } else {
          messageQueue.push(commit, create);
        }
      }
    });

    // OpenAI → Twilio
    openaiWs.on("message", (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch (err) {
        console.error("❌ Failed to parse OpenAI message:", raw.toString());
        return;
      }

      if (event.type === "response.output_text.delta") {
        console.log("💬 GPT text (partial):", event.delta);
      }
      if (event.type === "response.completed") {
        console.log("✅ GPT turn completed");
      }

      if (event.type === "response.output_audio.delta" && event.delta) {
        console.log("🔊 Sending audio chunk back to Twilio");
        twilioWs.send(
          JSON.stringify({
            event: "media",
            media: { payload: event.delta }, // already base64
          })
        );
      }
    });

    // Cleanup
    twilioWs.on("close", () => {
      console.log("❌ Twilio closed");
      if (commitInterval) clearInterval(commitInterval);
      openaiWs.close();
    });

    openaiWs.on("close", () => {
      console.log("❌ OpenAI closed");
      if (commitInterval) clearInterval(commitInterval);
    });

    openaiWs.on("error", (err) =>
      console.error("❌ OpenAI WS error:", err.message)
    );
  });
}