export function sendDummyMedia(ws, streamSid) {
  const silencePayload = ""; // base64-encoded silence
  ws.send(JSON.stringify({
    event: "media",
    streamSid,
    media: { payload: silencePayload }
  }));
}