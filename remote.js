// Samsung TV remote over wss://8002 with stored token.
// Waits for the TV's ms.channel.connect ack before sending keys (TV drops commands sent earlier).
// Maps friendly key names to this TV's real codes (KEY_VOLUMEUP -> KEY_VOLUP etc.).
// Usage: bun remote.js <KEY> [KEY...]   (e.g. bun remote.js KEY_MUTE, bun remote.js KEY_VOLUMEUP KEY_MENU)
const fs = require("fs");
const path = require("path");
const https = require("https");
const WebSocket = require("ws");
const AGENT = new https.Agent({ rejectUnauthorized: false });
const IP = "192.168.1.119";
const NAME = "U2Ftc3VuZ1JlbW90ZUFwcA==";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ALIASES = {
  KEY_VOLUMEUP: "KEY_VOLUP",
  KEY_VOLUMEDOWN: "KEY_VOLDOWN",
  KEY_CHANNELUP: "KEY_CHUP",
  KEY_CHANNELDOWN: "KEY_CHDOWN",
  KEY_ENTER: "KEY_RETURN",
  KEY_ESC: "KEY_BACK",
  KEY_HOME: "KEY_HOME",
};
const norm = k => ALIASES[k] || k;

const token = fs.readFileSync(path.join(__dirname, "token.txt"), "utf8").trim();
const keys = process.argv.slice(2).map(norm);
const ws = new WebSocket(`wss://${IP}:8002/api/v2/channels/samsung.remote.control?name=${NAME}&token=${token}`, { agent: AGENT });

let connectSeen = false;
ws.onmessage = e => {
  const s = e.data.toString();
  if (s.includes("ms.channel.connect")) { connectSeen = true; return; }
  if (s.includes("No Authorized")) return;
  console.log("TV:", s.slice(0, 200));
};
ws.onopen = async () => {
  for (let i = 0; i < 150 && !connectSeen; i++) await sleep(100);
  if (!connectSeen) console.log("WARN: no connect ack in 15s, sending anyway");
  for (const k of keys) {
    ws.send(JSON.stringify({ method: "ms.remote.control", params: { TypeOfRemote: "SendRemoteKey", Cmd: "Click", DataOfCmd: k, Option: "false" } }));
    await sleep(500);
  }
  console.log("SENT:", keys.join(", "));
  await sleep(300);
  ws.close();
  process.exit(0);
};
ws.onclose = e => { if (e.code !== 1000) { console.log("CLOSED", e.code, e.reason || ""); process.exit(1); } };
ws.onerror = e => { console.log("WS_ERROR", e.message); process.exit(1); };
setTimeout(() => { console.error("TIMEOUT"); process.exit(2); }, 30000);
