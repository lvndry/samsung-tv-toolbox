// Ask the TV for its current state and print everything it answers.
//
//   node state.js
//
// Some models (this one among them) answer to almost none of these events —
// the TV is quiet by design. If nothing prints after ~5 s, that is a
// working result, not a failure.
import { RemoteControl, loadToken, sleep } from './lib/tv.js';

const events = ['ed.apps.current.get', 'ed.media.get', 'ed.installedApp.get'];

const remote = await RemoteControl.connect({ token: loadToken() });
let heard = 0;
remote.listen((line) => {
  heard++;
  console.log('TV:', line);
});

try {
  for (let i = 0; i < 10; i++) {
    remote.request(events[i % events.length]);
    await sleep(2000);
  }
} finally {
  remote.close();
}

if (!heard) console.log('the TV answered nothing (this model is mostly silent — expected)');
else console.log(`heard ${heard} event(s)`);
