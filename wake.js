// Wake the TV over the network (Wake-on-LAN).
//
//   node wake.js <MAC> [broadcast]
//
// The TV's MAC address (get it from the TV's network settings, or `arp -a`)
// comes up in ~10 seconds. Note: apps do NOT auto-launch after a WoL wake —
// if you need the homebrew sideloader (port 8091), start it after the TV is
// up.
import dgram from 'node:dgram';
import { TV_IP } from './lib/tv.js';

const MAC = (process.argv[2] || '').toLowerCase();
if (!MAC) {
  console.error(`usage: node wake.js <MAC> [broadcast]`);
  console.error(`MAC of the TV, e.g. node wake.js aa:bb:cc:dd:ee:ff — find it in the TV's network settings or with arp -a`);
  process.exit(1);
}
// Default broadcast: the TV's own network, last octet 255 (respects TV_IP).
const defaultBroadcast = TV_IP.replace(/\d+$/, '255');
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
