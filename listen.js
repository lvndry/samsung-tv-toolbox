// Watch what the TV pushes on the remote channel, live.
//
//   node listen.js
//
// Then interact with the TV (open an app, press play) and the events show
// up here. Ctrl+C to stop. Note: many models are quiet on this channel —
// silence can be normal.
import { RemoteControl, loadToken } from './lib/tv.js';

const remote = await RemoteControl.connect({ token: loadToken() });
remote.listen((line) => console.log('EV:', line));
console.log('listening — interact with the TV, Ctrl+C to stop');

process.on('SIGINT', () => {
  remote.close();
  process.exit(0);
});
