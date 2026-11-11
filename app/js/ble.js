// Standard Bluetooth Heart Rate Profile (service 0x180D, characteristic 0x2A37).
// Works in Chrome/Edge on Android, Windows, macOS and ChromeOS over HTTPS. Not in iOS Safari.
export const bleSupported = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export async function connectHeartRate(onBeat, onDisconnect) {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
  device.addEventListener('gattserverdisconnected', () => onDisconnect && onDisconnect());
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('heart_rate');
  const ch = await service.getCharacteristic('heart_rate_measurement');
  ch.addEventListener('characteristicvaluechanged', (e) => {
    const dv = e.target.value, flags = dv.getUint8(0);
    const hr = flags & 0x1 ? dv.getUint16(1, true) : dv.getUint8(1);
    if (hr > 25 && hr < 230) onBeat(hr);
  });
  await ch.startNotifications();
  return { name: device.name || 'Heart-rate band', disconnect: () => device.gatt.disconnect() };
}

// Averages beats into 1-minute means, the input the estimator expects.
export class MinuteAverager {
  constructor() { this.sum = 0; this.n = 0; this.start = Date.now(); }
  add(hr) { this.sum += hr; this.n += 1; }
  ready(now = Date.now()) { return now - this.start >= 60000; }
  take(now = Date.now()) { const v = this.n ? this.sum / this.n : null; this.sum = 0; this.n = 0; this.start = now; return v; }
}
