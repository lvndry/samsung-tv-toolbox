// Subscribe to the remote channel and listen for app/media state events for 25s.
const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");
const AGENT = new https.Agent({ rejectUnauthorized: false });
const IP = "192.168.1.119";
const NAME = "U2Ftc3VuZ1JlbW90ZUFwcA==";
const token = fs.readFileSync(require("path").join(__dirname, "token.txt"), "utf8").trim();
const ws = new WebSocket(`wss://${IP}:8002/api/v2/channels/samsung.remote.control?name=${NAME}&token=${token}`, { agent: AGENT });
ws.onmessage = e => {
  const s = e.data.toString();
  console.log("EV:", s.slice(0, 400));
};
ws.onopen = () => console.log("LISTENING for 25s — interact with the TV (open an app, press play) to see events");
ws.onclose = e => console.log("CLOSED", e.code);
setTimeout(() => process.exit(0), 25000);
