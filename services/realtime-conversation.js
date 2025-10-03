// services/realtime-conversation.js
import fetch from "node-fetch";
import WebSocket from "ws";

// ... resampleTo24k, resample24kTo8k, pcm16ToMuLaw8, extractAudioBase64 remain unchanged ...

export function setupRealtime(app) {
  app.ws("/realtime", async (ws) => {
    console.log("✅ Twilio WebSocket connected → starting realtime conversation");

    // 1️⃣ Get ephemeral client secret
    const resp = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const keyData = await resp.json();
    const ephemeralKey = keyData?.value || keyData?.client_secret?.value;

    if (!ephemeralKey) {
      console.error("❌ No ephemeral key found, closing WebSocket");
      ws.close();
      return;
    }

    // 2️⃣ Connect to OpenAI Realtime WS
    const openAIWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview&voice=alloy",
      { headers: { Authorization: `Bearer ${ephemeralKey}` } }
    );

    // Buffers to batch audio for Twilio
    let audioBatch = [];
    let batchCounter = 0;

    // Store current text response
    let currentResponseText = "";

    openAIWs.on("open", () => {
      console.log("🔗 Connected to OpenAI Realtime WebSocket");

      // 3️⃣ Instant TTS greeting on call connect
      const greeting = "Hello! This is Finlumina Vox speaking instantly as the call connects.";
      currentResponseText += greeting;

      openAIWs.send(JSON.stringify({
        type: "response.create",
        response: { instructions: greeting }
      }));
    });

    openAIWs.on("message", (msg) => {
      let event;
      try { event = JSON.parse(msg.toString()); } catch { return; }

      if (event.type === "error") {
        console.error("❌ OpenAI Realtime error:", event.error?.message);
        return;
      }

      switch (event.type) {
        case "response.output_audio.delta": {
          const audioB64 = extractAudioBase64(event);
          if (!audioB64) break;

          try {
            audioBatch.push(audioB64);

            // Send in batches of 80 microchunks
            if (audioBatch.length >= 80) {
              const pcm24 = new Int16Array(Buffer.from(audioBatch.join(""), "base64").buffer);
              const pcm8 = resample24kTo8k(pcm24);
              const muLaw8 = pcm16ToMuLaw8(pcm8);

              ws.send(JSON.stringify({
                event: "media",
                media: { payload: Buffer.from(muLaw8).toString("base64") }
              }));

              batchCounter++;
              console.log(`🎙️ Forwarded audio batch #${batchCounter}`);
              audioBatch = [];
            }
          } catch (err) {
            console.error("❌ Error processing OpenAI audio batch:", err);
          }
          break;
        }

        case "response.output_audio_transcript.delta":
          if (event.delta) console.log("📝 Transcript chunk:", event.delta);
          break;

        case "response.output_text.delta":
          currentResponseText += event.delta || "";
          console.log("💬 Partial text:", event.delta);
          break;

        case "response.output_text.completed":
          currentResponseText += event.text || "";
          console.log("💬 Final text:", currentResponseText);
          currentResponseText = ""; // reset for next response
          break;

        case "response.output_audio.done":
        case "response.done":
          // Flush any leftover audio batch
          if (audioBatch.length > 0) {
            const pcm24 = new Int16Array(Buffer.from(audioBatch.join(""), "base64").buffer);
            const pcm8 = resample24kTo8k(pcm24);
            const muLaw8 = pcm16ToMuLaw8(pcm8);

            ws.send(JSON.stringify({
              event: "media",
              media: { payload: Buffer.from(muLaw8).toString("base64") }
            }));

            batchCounter++;
            console.log(`🎙️ Forwarded final audio batch #${batchCounter}`);
            audioBatch = [];
          }

          console.log(`📩 OpenAI event: ${event.type}`);
          break;

        default:
          console.log("📩 OpenAI event:", event.type);
      }
    });

    openAIWs.on("error", (err) => console.error("📩 OpenAI WS transport error:", err));

    // 3️⃣ Twilio → OpenAI audio
    ws.on("message", (msg) => {
      try {
        const data = typeof msg === "string" ? JSON.parse(msg) : msg;
        if (data.event === "media" && data.media?.payload && openAIWs.readyState === 1) {
          const buffer8k = new Int16Array(Buffer.from(data.media.payload, "base64").buffer);
          const buffer24k = resampleTo24k(buffer8k);

          if (buffer24k.length < 2400) return; // skip tiny chunks

          console.log(`🎙️ Forwarding audio: ${buffer8k.length} → ${buffer24k.length}`);
          openAIWs.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: Buffer.from(buffer24k.buffer).toString("base64"),
          }));
        }

        if (data.event === "stop") {
          openAIWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          openAIWs.send(JSON.stringify({ type: "response.create" }));
        }
      } catch (err) {
        console.error("❌ Error parsing Twilio message:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("⚠️ Twilio WebSocket disconnected");
      if (openAIWs) openAIWs.close();
    });
  });
}