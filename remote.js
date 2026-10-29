// Send remote keys to the TV.
//
//   node remote.js power
//   node remote.js ok up down left ok
//   node remote.js power:hold          # long press, 1 s
//   node remote.js back:hold:3000      # long press, 3 s
//   node remote.js --text "hello"      # type into an open on-screen keyboard
//
// Friendly names (power, volumeUp, ok, ...) or raw TV codes (KEY_MUTE,
// KEY_0, KEY_RED) both work. See lib/tv.js for the full name list.
import { RemoteControl, loadToken } from './lib/tv.js';

const args = process.argv.slice(2);
const textAt = args.indexOf('--text');
const text = textAt === -1 ? null : args[textAt + 1];
const names = args.filter((_, index) => textAt === -1 || (index !== textAt && index !== textAt + 1));

if ((!names.length && text === null) || (textAt !== -1 && text === undefined)) {
  console.log('usage: node remote.js <key>[:hold[:ms]] [...]   or   node remote.js --text "..."');
  process.exit(1);
}

let remote;
try {
  remote = await RemoteControl.connect({ token: loadToken() });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
try {
  for (const name of names) {
    const [key, mode, holdMs] = name.split(':');
    if (mode === 'hold') await remote.holdKey(key, { holdMs: Number(holdMs) || 1000 });
    else await remote.sendKey(name);
  }
  if (text !== null) await remote.sendText(text);
  console.log(`SENT: ${[...names, ...(text !== null ? [`text "${text}"`] : [])].join(', ')}`);
} finally {
  remote.close();
}
