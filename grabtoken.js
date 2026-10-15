// Grab token from wss://8002 connect event (fallback: pairing PIN flow), then
// reconnect with the token and send a visible test key (KEY_VOLUMEUP).
const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");
const AGENT = new https.Agent({ rejectUnauthorized: false });
const IP = "192.168.1.119";
const NAME = "U2Ftc3VuZ1JlbW90ZUFwcA==";
const sleep = ms => new Promise(r => setTimeout(r, ms));

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { agent: AGENT });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
    setTimeout(() => reject(new Error("connect timeout")), 10000);
  });
}

(async () => {
  // Step 1: connect, capture token from ms.channel.connect
  let ws = await connectWs(`wss://${IP}:8002/api/v2/channels/samsung.remote.control?name=${NAME}`);
  let token = null;
  const firstMsg = await new Promise((resolve) => {
    ws.on("message", d => {
      const m = JSON.parse(d.toString());
      if (m.event === "ms.channel.connect") resolve(m);
      else resolve(m);
    });
  });
  console.log("CONNECT:", JSON.stringify(firstMsg).slice(0, 300));
  token = firstMsg.data && firstMsg.data.token;

  if (!token) {
    console.log("NO_TOKEN, starting pairing PIN flow");
    ws.send(JSON.stringify({ event: "req", id: "pairing", data: "pairing" }));
    let m = await new Promise(r => ws.on("message", d => r(JSON.parse(d.toString()))));
    console.log("PAIR_R1:", JSON.stringify(m).slice(0, 300));
    if (m.result === "SUC" && typeof m.data === "string") {
      console.log("PIN=" + m.data);
      // wait for user PIN in file
      let pin = null;
      for (let i = 0; i < 240; i++) {
        await sleep(500);
        try { const t = fs.readFileSync("/tmp/samsung-pin-in.txt", "utf8").trim(); if (t) pin = t.replace(/-/g, ""); } catch {}
        if (pin) break;
      }
      if (!pin) { console.log("RESULT=PIN_TIMEOUT"); process.exit(1); }
      ws.send(JSON.stringify({ event: "req", id: "pairing", data: pin }));
      m = await new Promise(r => ws.on("message", d => r(JSON.parse(d.toString()))));
      console.log("PAIR_R2:", JSON.stringify(m).slice(0, 300));
      token = (m.data && m.data.token) || (typeof m.data === "string" && m.data.startsWith("eyJ") ? m.data : null);
    }
  }
  if (!token) { console.log("RESULT=NO_TOKEN"); process.exit(1); }
  fs.writeFileSync("/tmp/samsung-token.txt", token);
  console.log("TOKEN_SAVED len=" + token.length);
  ws.close();

  // Step 2: reconnect with token, send test key
  await sleep(500);
  ws = await connectWs(`wss://${IP}:8002/api/v2/channels/samsung.remote.control?name=${NAME}&token=${token}`);
  const m2 = await new Promise(r => ws.on("message", d => r(JSON.parse(d.toString()))));
  console.log("RECONNECT:", m2.event, JSON.stringify(m2.data || {}).slice(0, 150));
  ws.send(JSON.stringify({ event: "req", id: "key", data: { type: "key", data: { code: "KEY_VOLUMEUP" } } }));
  await sleep(1000);
  ws.send(JSON.stringify({ event: "req", id: "key", data: { type: "key", data: { code: "KEY_VOLUMEDOWN" } } }));
  await sleep(500);
  console.log("RESULT=TEST_KEYS_SENT (you should have seen volume nudge on the TV)");
  ws.close();
  process.exit(0);
})().catch(e => { console.log("RESULT=FAILED:", e.message); process.exit(1); });
setTimeout(() => { console.error("TIMEOUT 60s"); process.exit(2); }, 60000);
