// Wake the TV over the network (Wake-on-LAN).
//
//   node wake.js [MAC] [broadcast]
//
// MAC defaults to the TV's, so a bare `node wake.js` just works. The TV comes
// up in ~10 seconds. Note: apps do NOT auto-launch after a WoL wake — if you
// need the homebrew sideloader (port 8091), start it after the TV is up.
import dgram from 'node:dgram';

const MAC = (process.argv[2] || 'f8:4e58:e7:11:de').toLowerCase();
// Default broadcast: the TV's own network, last octet 255 (respects TV_IP).
const defaultBroadcast = (process.env.TV_IP || '192.168.1.119').replace(/\d+$/, '255');
const broadcast = process.argv[3] || defaultBroadcast;

const bytes = MAC.match(/..../g)?.map(h => parseInt(h, 16));
if (!bytes || bytes.length !== 6) {
  console.error(`not a MAC address: ${MAC}`);
  process.exit(1);
}

// Magic packet: 6 filler bytes, then the MAC repeated 16 times.
const packet = Buffer.alloc(6 + 6 * 16);
packet.fill(0xff, 0, 6);
for (let i = 0; i < 16; i++) bytes.copy(packet, 6 + i * 6);

const socket = dgram.createSocket('udp4');
const targets = [`${broadcast}:9`, '255.255.255.255:9'];
let sent = 0;
for (const [host, port] of targets.map(t => t.split(':')).map(([h, p]) => [h, Number(p)])) {
  socket.send(packet, p, h, () => {
    sent++;
    if (sent === targets.length) {
      socket.close();
      console.log(`sent to ${targets.join(' and ')} — the TV is up in ~10 s`);
    }
  });
}
