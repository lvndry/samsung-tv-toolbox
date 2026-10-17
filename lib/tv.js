// Shared plumbing for every script in this repo.
//
// One place for the TV address, the pairing token, and the Samsung Control
// 2.0 websocket (wss://<tv>:8002). Every CLI in this repo is a thin wrapper
// around RemoteControl below.
//
// The TV's certificate is a self-signed one, so TLS verification is switched
// off. This is fine on a private LAN — nothing on this channel is secret.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import WebSocket from 'ws';

const dir = path.dirname(fileURLToPath(import.meta.url));

// The TV's IP. Override per machine with: TV_IP=10.0.0.5 node remote.js power
export const TV_IP = process.env.TV_IP || '192.168.1.119';

// Base64 of "SamsungRemoteApp" — the client name Samsung's Control 2.0 expects.
export const REMOTE_NAME = 'U2Ftc3VuZ1JlbW90ZUFwcA==';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function tokenPath() {
  return path.join(dir, '..', 'token.txt');
}

export function loadToken() {
  try {
    return fs.readFileSync(tokenPath(), 'utf8').trim();
  } catch {
    console.error(`no token at ${tokenPath()} — run: node pair.js`);
    process.exit(1);
  }
}

// A Control 2.0 remote connection.
//
//   const remote = await connect({ token: loadToken() });
//   await remote.keys(['power']);
//   remote.listen((line) => console.log(line));
//   remote.close();
//
// The TV drops any key sent before it has acknowledged the channel, so
// every connect() resolves only after that "ms.channel.connect" ack has
// been seen (or the given timeout elapses).
export class RemoteControl {
  static channelUrl(token) {
    return `wss://${TV_IP}:8002/api/v2/channels/samsung.remote.control?name=${REMOTE_NAME}${token ? `&token=${token}` : ''}`;
  }

  static async connect({ token, timeoutMs = 15000 } = {}) {
    const remote = new RemoteControl(token);
    await remote.#open(timeoutMs);
    return remote;
  }

  #token;
  #ws;
  #connected = false;
  #listeners = [];

  constructor(token) {
    this.#token = token;
  }

  async #open(timeoutMs) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    this.#ws = new WebSocket(RemoteControl.channelUrl(this.#token), { agent });
    this.#ws.on('message', (data) => this.#onMessage(data.toString()));

    await new Promise((resolve, reject) => {
      this.#ws.on('open', () => {});
      this.#ws.on('error', reject);
      setTimeout(resolve, timeoutMs); // ack timeout resolves; keys still go out
    }).catch(() => {});

    await new Promise((resolve) => {
      const check = () => {
        if (this.#connected || !this.#ws || this.#ws.readyState !== 1) resolve();
        else setTimeout(check, 100);
      };
      check();
      setTimeout(resolve, timeoutMs);
    });

    if (!this.#connected) console.log('WARN: no connect ack, sending anyway');
  }

  #onMessage(raw) {
    if (raw.includes('ms.channel.connect')) {
      this.#connected = true;
      return;
    }
    if (raw.includes('No Authorized')) return;
    for (const listener of this.#listeners) listener(raw.slice(0, 400));
  }

  // One keypress. Accepts friendly aliases (volumeUp -> KEY_VOLUP, ...).
  sendKey(name, { delayMs = 500 } = {}) {
    const code = KEYS[name] || name;
    this.#ws.send(JSON.stringify({
      method: 'ms.remote.control',
      params: { TypeOfRemote: 'SendRemoteKey', Cmd: 'Click', DataOfCmd: code, Option: 'false' },
    }));
    return sleep(delayMs);
  }

  // A run of keypresses, each waited on.
  async keys(names, { delayMs = 500 } = {}) {
    for (const name of names) await this.sendKey(name, { delayMs });
  }

  // Emit a state event request (e.g. "ed.apps.current.get") on the channel.
  request(event) {
    this.#ws.send(JSON.stringify({ method: 'ms.channel.emit', params: { event, to: 'host' } }));
  }

  // Receive whatever the TV pushes on the channel. Returns an unsubscribe fn.
  listen(listener) {
    this.#listeners.push(listener);
    return () => {
      this.#listeners = this.#listeners.filter((l) => l !== listener);
    };
  }

  close() {
    try { this.#ws?.close(); } catch {}
  }
}

// Friendly names for the keys people actually press. Anything not listed is
// passed through verbatim, so every raw TV code (KEY_0 ... KEY_9, KEY_RED,
// KEY_GREEN, KEY_YELLOW, KEY_BLUE, KEY_APPS, ...) works too.
export const KEYS = {
  power: 'KEY_POWER',
  home: 'KEY_HOME',
  back: 'KEY_BACK',
  ok: 'KEY_RETURN',
  enter: 'KEY_RETURN',
  esc: 'KEY_BACK',
  up: 'KEY_UP',
  down: 'KEY_DOWN',
  left: 'KEY_LEFT',
  right: 'KEY_RIGHT',
  mute: 'KEY_MUTE',
  volumeUp: 'KEY_VOLUP',
  volumeDown: 'KEY_VOLDOWN',
  channelUp: 'KEY_CHUP',
  channelDown: 'KEY_CHDOWN',
  apps: 'KEY_APPS',
  menu: 'KEY_MENU',
  info: 'KEY_INFO',
  tool: 'KEY_TOOL',
  '123': 'KEY_123',
};
