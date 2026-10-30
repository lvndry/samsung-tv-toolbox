// One-time pairing with the TV, then a test key to prove it worked.
//
// Connects without a token. If the TV has already been paired from this
// machine before, the token comes straight from the connect event and this
// is a 2-second affair. Otherwise the TV shows a PIN — type it into the
// PIN_INPUT_FILE (a private, per-run file in the OS temp dir; the path is
// printed when it is needed) and the script picks it up.
//
//   node pair.js
//
// On success the token is saved to token.txt next to this script (mode
// 0600) — that file is the entire authentication, keep it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RemoteControl, sleep } from './lib/tv.js';
import WebSocket from 'ws';

const dir = path.dirname(fileURLToPath(import.meta.url));
// Per-run PIN input file: private (0600), unique, unlinked once read.
const pinFile = path.join(os.tmpdir(), `samsung-pin-in-${process.pid}-${crypto.randomBytes(4).toString('hex')}.txt`);

// Read the next message that arrives on the open socket.
function nextMessage(ws, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for TV')), timeoutMs);
    const onMessage = (data) => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(JSON.parse(data.toString()));
    };
    ws.on('message', onMessage);
  });
}


// The connect message embeds the pairing token — never print it raw.
function describe(message) {
  const copy = { ...message };
  if (copy?.data && typeof copy.data === 'object') copy.data = { ...copy.data, token: '…' };
  else if (typeof copy?.data === 'string' && copy.data.length > 20) copy.data = '…';
  return JSON.stringify(copy).slice(0, 300);
}

const ws = await new Promise((resolve, reject) => {
  const socket = new WebSocket(RemoteControl.channelUrl(undefined));
  socket.on('open', () => resolve(socket));
  socket.on('error', reject);
  setTimeout(() => reject(new Error('connect timeout')), 10000);
});

console.log('connected, waiting for the TV...');
let message = await nextMessage(ws);
console.log('TV:', describe(message));
let token = message?.data?.token ?? null;

if (!token) {
  console.log('TV asks for a pairing PIN — it is shown on the screen right now.');
  ws.send(JSON.stringify({ event: 'req', id: 'pairing', data: 'pairing' }));
  message = await nextMessage(ws);
  if (message.result !== 'SUC' || typeof message.data !== 'string') {
    console.error('pairing failed:', JSON.stringify(message).slice(0, 200));
    process.exit(1);
  }
  console.log(`PIN on the TV: ${message.data}`);
  console.log(`type it (dashes ok) into ${pinFile}, e.g.:  echo 1234 > ${pinFile}`);
  let pin = null;
  try {
    for (let i = 0; i < 240 && !pin; i++) {
      await sleep(500);
      try {
        const typed = fs.readFileSync(pinFile, 'utf8').trim();
        if (typed) pin = typed.replace(/-/g, '');
      } catch {}
    }
    if (!pin) {
      console.error('gave up waiting for the PIN');
      process.exit(1);
    }
    ws.send(JSON.stringify({ event: 'req', id: 'pairing', data: pin }));
    message = await nextMessage(ws);
  } finally {
    try { fs.unlinkSync(pinFile); } catch {}
  }
  console.log('TV:', describe(message));
  token = message?.data?.token ?? (typeof message?.data === 'string' ? message.data : null);
}

if (!token) {
  console.error('no token came back — try again after checking the TV screen');
  process.exit(1);
}

const file = path.join(dir, 'token.txt');
fs.writeFileSync(file, token, { mode: 0o600 });
console.log(`token saved to ${file}`);
ws.close();

// Prove the token works by sending a visible test key.
await sleep(500);
const remote = await RemoteControl.connect({ token });
await remote.sendKey('volumeUp');
await remote.sendKey('volumeDown');
remote.close();
console.log('done — if the volume nudged, pairing works. Now try: node remote.js power');
