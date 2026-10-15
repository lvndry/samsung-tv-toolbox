// Open Developer Mode on the CU7105: apps panel -> settings gear (top-right) -> 123 -> keypad 12345.
// One persistent connection, careful timing.
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
const key = (k, ms = 500) => new Promise(r => {
  ws.send(JSON.stringify({ method: "ms.remote.control", params: { TypeOfRemote: "SendRemoteKey", Cmd: "Click", DataOfCmd: k, Option: "false" } }));
  setTimeout(r, ms);
});

ws.onopen = async () => {
  for (let i = 0; i < 150 && !connectSeen; i++) await sleep(100);
  console.log("-- home first");
  await key("KEY_HOME", 1500);
  console.log("-- apps panel");
  await key("KEY_APPS", 1500);
  console.log("-- to top-right gear");
  await key("KEY_UP", 400); await key("KEY_UP", 400);
  await key("KEY_RIGHT", 400); await key("KEY_RIGHT", 400);
  await key("KEY_RETURN", 1500);
  console.log("-- 123 (keypad)");
  await key("KEY_123", 2500);
  console.log("-- keypad: 1 2 3 4 5");
  // keypad focus starts at center (5). D-pad + OK:
  await key("KEY_UP", 350); await key("KEY_LEFT", 350); await key("KEY_RETURN", 600);  // 1
  await key("KEY_UP", 350); await key("KEY_RETURN", 600);                              // 2
  await key("KEY_UP", 350); await key("KEY_RIGHT", 350); await key("KEY_RETURN", 600); // 3
  await key("KEY_LEFT", 350); await key("KEY_RETURN", 600);                            // 4
  await key("KEY_RETURN", 800);                                                        // 5
  console.log("DONE — check TV for a gray Developer Mode popup");
  process.exit(0);
};
ws.onclose = e => { if (e.code !== 1000) { console.log("CLOSED", e.code); process.exit(1); } };
setTimeout(() => process.exit(2), 45000);
