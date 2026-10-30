// Print what the TV says about itself: model, firmware, power state,
// Developer Mode, and the MAC address wake.js needs. No pairing required.
//
//   node info.js
//   node info.js --json     # the full answer
import { TV_IP, CONTROL_BASE } from './lib/tv.js';

const response = await fetch(`${CONTROL_BASE}/api/v2/`, { signal: AbortSignal.timeout(5000) })
  .catch((error) => {
    console.error(`no answer from ${TV_IP}:8001. Is the TV on? (${error.message})`);
    process.exit(1);
  });

if (!response.ok) {
  console.error(`${TV_IP}:8001 answered HTTP ${response.status}`);
  process.exit(1);
}

const answer = await response.json();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(answer, null, 2));
  process.exit(0);
}

const device = answer.device || {};
const rows = [
  ['name', device.name],
  ['model', device.modelName],
  ['firmware', device.firmwareVersion],
  ['os', device.OS],
  ['power', device.PowerState],
  ['developer mode', device.developerMode === '1' ? 'on' : device.developerMode === '0' ? 'off' : device.developerMode],
  ['developer ip', device.developerIP || device.developerIp],
  ['wifi mac', device.wifiMac],
  ['network', device.networkType],
];

for (const [label, value] of rows) {
  if (value !== undefined && value !== '') console.log(`${label.padEnd(15)} ${value}`);
}
