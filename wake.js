// Wake the TV over the network (Wake-on-LAN).
//
//   node wake.js <MAC> [broadcast]
//
// The TV comes up in ~10 seconds. Get its MAC address once with
// `node info.js` while it is on. Apps do NOT auto-launch after a WoL wake;
// start what you need with app.js once the TV is up.
import dgram from 'node:dgram';
import os from 'node:os';
import { TV_IP } from './lib/tv.js';

const MAC = (process.argv[2] || '').toLowerCase();
if (!MAC) {
  console.error(`usage: node wake.js <MAC> [broadcast]`);
  console.error(`MAC of the TV, e.g. node wake.js aa:bb:cc:dd:ee:ff (get it with node info.js while the TV is on)`);
  process.exit(1);
}
// Without a TV_IP the TV's network is unknown (127.0.0.255 reaches nothing), so this machine's own LAN is used.
function lanBroadcast() {
  const lan = Object.values(os.networkInterfaces()).flat()
    .find((address) => address && address.family === 'IPv4' && !address.internal);
  if (!lan) return '255.255.255.255';
  const octets = lan.address.split('.').map(Number);
  const mask = lan.netmask.split('.').map(Number);
  return octets.map((octet, index) => (octet | (~mask[index] & 255))).join('.');
}

const defaultBroadcast = TV_IP.startsWith('127.') ? lanBroadcast() : TV_IP.replace(/\d+$/, '255');
const broadcast = process.argv[3] || defaultBroadcast;

const bytes = Buffer.from(MAC.replace(/[:\-]/g, '').match(/../g).map(h => parseInt(h, 16)));
if (!bytes || bytes.length !== 6) {
  console.error(`not a MAC address: ${MAC}`);
  process.exit(1);
}

// Magic packet: 6 filler bytes, then the MAC repeated 16 times.
const packet = Buffer.alloc(6 + 6 * 16);
packet.fill(0xff, 0, 6);
for (let i = 0; i < 16; i++) bytes.copy(packet, 6 + i * 6);

const socket = dgram.createSocket('udp4');
const targets = [[broadcast, 9], ['255.255.255.255', 9]];
let sent = 0;
for (const [host, port] of targets) {
  socket.send(packet, port, host, () => {
    sent++;
    if (sent === targets.length) {
      socket.close();
      console.log(`sent to ${broadcast}:9 and 255.255.255.255:9 — the TV is up in ~10 s`);
    }
  });
}
