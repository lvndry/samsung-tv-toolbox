// Tap 12345 on the on-screen keypad. Focus assumed to start at 5 (center).
// Grid: 1 2 3 / 4 5 6 / 7 8 9.
const fs = require("fs");
const path = require("path");
const https = require("https");
const WebSocket = require("ws");
const AGENT = new https.Agent({ rejectUnauthorized: false });
const IP = "192.168.1.119";
const NAME = "U2Ftc3VuZ1JlbW90ZUFwcA==";
const token = fs.readFileSync(path.join(__dirname, "token.txt"), "utf8").trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ws = new WebSocket(`wss://${IP}:8002/api/v2/channels/samsung.remote.control?name=${NAME}&token=${token}`, { agent: AGENT });
let connectSeen = false;
ws.onmessage = e => {
  const s = e.data.toString();
  if (s.includes("ms.channel.connect")) { connectSeen = true; return; }
  if (s.includes("No Authorized")) return;
  console.log("TV:", s.slice(0, 150));
};
const key = (k, ms = 450) => new Promise(r => {
  ws.send(JSON.stringify({ method: "ms.remote.control", params: { TypeOfRemote: "SendRemoteKey", Cmd: "Click", DataOfCmd: k, Option: "false" } }));
  setTimeout(r, ms);
});
ws.onopen = async () => {
  for (let i = 0; i < 150 && !connectSeen; i++) await sleep(100);
  // from 5:  1 = up,left   | 2 = up          | 3 = up,right | 4 = left | 5 = (here)
  console.log("tap 1"); await key("KEY_UP"); await key("KEY_LEFT"); await key("KEY_RETURN", 700);
  console.log("tap 2"); await key("KEY_RIGHT"); await key("KEY_RIGHT"); await key("KEY_RETURN", 700);
  console.log("tap 3"); await key("KEY_RIGHT"); await key("KEY_RETURN", 700);
  console.log("tap 4"); await key("KEY_LEFT"); await key("KEY_LEFT"); await key("KEY_RETURN", 700);
  console.log("tap 5"); await key("KEY_RIGHT"); await key("KEY_RETURN", 700);
  console.log("DONE — check TV");
  process.exit(0);
};
ws.onclose = e => { if (e.code !== 1000) { console.log("CLOSED", e.code); process.exit(1); } };
setTimeout(() => process.exit(2), 40000);
