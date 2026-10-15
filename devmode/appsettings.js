// Official Samsung flow: Smart Hub > Apps > scroll to bottom > "App Settings".
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
};
const key = (k, ms = 500) => new Promise(r => {
  ws.send(JSON.stringify({ method: "ms.remote.control", params: { TypeOfRemote: "SendRemoteKey", Cmd: "Click", DataOfCmd: k, Option: "false" } }));
  setTimeout(r, ms);
});
ws.onopen = async () => {
  for (let i = 0; i < 150 && !connectSeen; i++) await sleep(100);
  console.log("-- home"); await key("KEY_HOME", 1500);
  console.log("-- apps"); await key("KEY_APPS", 2000);
  console.log("-- scroll to bottom");
  for (let i = 0; i < 8; i++) await key("KEY_DOWN", 500);
  console.log("DONE — check TV: is 'App Settings' highlighted at the bottom?");
  process.exit(0);
};
ws.onclose = e => { if (e.code !== 1000) process.exit(1); };
setTimeout(() => process.exit(2), 40000);
