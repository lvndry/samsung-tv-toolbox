// Ask the TV for current app / media state, re-asking every 2s (token warm-up) for 25s.
const fs = require("fs");
const path = require("path");
const https = require("https");
const WebSocket = require("ws");
const AGENT = new https.Agent({ rejectUnauthorized: false });
const IP = "192.168.1.119";
const NAME = "U2Ftc3VuZ1JlbW90ZUFwcA==";
const token = fs.readFileSync(path.join(__dirname, "token.txt"), "utf8").trim();
const ws = new WebSocket(`wss://${IP}:8002/api/v2/channels/samsung.remote.control?name=${NAME}&token=${token}`, { agent: AGENT });
let got = 0;
ws.onmessage = e => {
  const s = e.data.toString();
  if (s.includes("ms.channel.connect") || s.includes("No Authorized")) return;
  got++;
  console.log("TV:", s.slice(0, 800));
};
const asks = ["ed.apps.current.get", "ed.media.get", "ed.installedApp.get"];
let n = 0;
ws.onopen = () => {
  console.log("LISTENING 25s");
  setInterval(() => {
    const ev = asks[n++ % asks.length];
    ws.send(JSON.stringify({ method: "ms.channel.emit", params: { event: ev, to: "host" } }));
  }, 2000);
};
ws.onclose = e => console.log("CLOSED", e.code);
setTimeout(() => {
  if (!got) console.log("NO_STATE_EVENTS in 25s");
  process.exit(0);
}, 25000);
