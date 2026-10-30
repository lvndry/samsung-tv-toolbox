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

// The TV's IP. Every script in this repo reads this one export. Set it per
// machine with: TV_IP=10.0.0.5 node remote.js power
export const TV_IP = process.env.TV_IP || '127.0.0.1';

// Base64 of "SamsungRemoteApp" — the client name Samsung's Control 2.0 expects.
const REMOTE_NAME = 'U2Ftc3VuZ1JlbW90ZUFwcA==';

// Samsung's REST API on the TV.
export const CONTROL_BASE = `http://${TV_IP}:8001`;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function tokenPath() {
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
//   const remote = await RemoteControl.connect({ token: loadToken() });
//   await remote.sendKey('power');
//   remote.listen((line) => console.log(line));
//   remote.close();
//
// connect() rejects with a clear error when the TV is unreachable (wrong
// IP, TV off, port 8002 refused) and never resolves with a dead socket.
// While it waits for the TV's "ms.channel.connect" ack, the TV drops any
// key sent before that ack — so every connect() resolves only after the
// ack has been seen (or the given timeout elapses).
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
  #timers = new Set();

  constructor(token) {
    this.#token = token;
  }

  // Track a timer so close() can clear them all and the process can exit.
  #track(t) {
    this.#timers.add(t);
    return t;
  }

  #clearTimers() {
    for (const t of this.#timers) clearTimeout(t);
    this.#timers.clear();
  }

  async #open(timeoutMs) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    this.#ws = new WebSocket(RemoteControl.channelUrl(this.#token), { agent });
    this.#ws.on('message', (data) => this.#onMessage(data.toString()));

    let socketError = null;
    this.#ws.on('error', (e) => { socketError = socketError ?? e; });

    // 1. Did the TCP/TLS connection come up at all? A refused port fires
    //    'error' and the socket stays CONNECTING — waiting for the ack
    //    would then just time out 15 s later with the socket already
    //    dead, so reject now with a message that says the TV is
    //    unreachable.
    const opened = await new Promise((resolve) => {
      let settled = false;
      const t = this.#track(setTimeout(() => finish(false), timeoutMs));
      const finish = (ok) => { if (!settled) { settled = true; clearTimeout(t); resolve(ok); } };
      this.#ws.on('open', () => finish(true));
      this.#ws.on('error', () => finish(false));
    });
    if (!opened) {
      const why = socketError ? socketError.message : `timed out after ${timeoutMs / 1000}s`;
      this.#clearTimers();
      try { this.#ws.close(); } catch {}
      throw new Error(`could not reach the TV at ${TV_IP}:8002 — is it on, paired, and on the same network? (${why})`);
    }

    // 2. Wait for the TV's connect ack. Resolves early if the socket dies.
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        this.#clearTimers();
        resolve();
      };
      this.#track(setInterval(() => {
        if (this.#connected || this.#ws.readyState !== 1) done();
      }, 100));
      this.#track(setTimeout(done, timeoutMs));
    });

    if (!this.#connected) {
      if (this.#ws.readyState !== 1) {
        const why = socketError ? socketError.message : 'socket closed';
        try { this.#ws.close(); } catch {}
        throw new Error(`TV at ${TV_IP}:8002 dropped the channel before acknowledging it (${why})`);
      }
      console.log('WARN: no connect ack, sending anyway');
    }
  }

  #onMessage(raw) {
    if (raw.includes('ms.channel.connect')) {
      this.#connected = true;
      return;
    }
    if (raw.includes('No Authorized')) return;
    for (const listener of this.#listeners) listener(raw.slice(0, 400));
  }

  #remoteKey(cmd, name) {
    this.#ws.send(JSON.stringify({
      method: 'ms.remote.control',
      params: { TypeOfRemote: 'SendRemoteKey', Cmd: cmd, DataOfCmd: KEYS[name] || name, Option: 'false' },
    }));
  }

  // One keypress. Accepts friendly aliases (volumeUp -> KEY_VOLUP, ...).
  sendKey(name, { delayMs = 500 } = {}) {
    this.#remoteKey('Click', name);
    return sleep(delayMs);
  }

  // A long press: the key is held down for holdMs, then released.
  async holdKey(name, { holdMs = 1000, delayMs = 500 } = {}) {
    this.#remoteKey('Press', name);
    await sleep(holdMs);
    this.#remoteKey('Release', name);
    return sleep(delayMs);
  }

  // Type into the on-screen keyboard. Only lands while one is open.
  async sendText(text, { delayMs = 500 } = {}) {
    this.#ws.send(JSON.stringify({
      method: 'ms.remote.control',
      params: { TypeOfRemote: 'SendInputString', Cmd: Buffer.from(text).toString('base64'), DataOfCmd: 'base64' },
    }));
    await sleep(delayMs);
    this.#ws.send(JSON.stringify({ method: 'ms.remote.control', params: { TypeOfRemote: 'SendInputEnd' } }));
    return sleep(delayMs);
  }

  // Emit an event on the channel (e.g. "ed.apps.current.get"), with optional data.
  request(event, data) {
    this.#ws.send(JSON.stringify({ method: 'ms.channel.emit', params: { event, to: 'host', ...(data && { data }) } }));
  }

  // Launch an app with a payload: DEEP_LINK for most apps, NATIVE_LAUNCH for
  // built-ins like the browser. The TV sends no reply on this model.
  launch(appId, { metaTag = '', native = false } = {}) {
    this.request('ed.apps.launch', { appId, action_type: native ? 'NATIVE_LAUNCH' : 'DEEP_LINK', metaTag });
  }

  // Receive whatever the TV pushes on the channel. Returns an unsubscribe fn.
  listen(listener) {
    this.#listeners.push(listener);
    return () => {
      this.#listeners = this.#listeners.filter((l) => l !== listener);
    };
  }

  close() {
    this.#clearTimers();
    try { this.#ws?.close(); } catch {}
  }
}

// Friendly names for the keys people actually press. Anything not listed is
// passed through verbatim, so every raw TV code (KEY_0 ... KEY_9, KEY_RED,
// KEY_GREEN, KEY_YELLOW, KEY_BLUE, KEY_APPS, ...) works too.
const KEYS = {
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
