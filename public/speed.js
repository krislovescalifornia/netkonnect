// Collector rates stay in bytes/second. Only their presentation changes.
export const speedUnits = ['Mbit/s', 'MB/s', 'KB/s', 'B/s', 'Kbit/s', 'Gbit/s', 'GB/s'];
const divisors = { 'Mbit/s':1e6 / 8, 'MB/s':1024 ** 2, 'KB/s':1024, 'B/s':1, 'Kbit/s':1e3 / 8, 'Gbit/s':1e9 / 8, 'GB/s':1024 ** 3 };
export const speedUnit = unit => speedUnits.includes(unit) ? unit : 'Mbit/s';
export const nextSpeedUnit = unit => speedUnits[(speedUnits.indexOf(speedUnit(unit)) + 1) % speedUnits.length];
export function formatSpeed(bytesPerSecond, unit = 'Mbit/s') {
  unit = speedUnit(unit);
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond)) return '—';
  const value = Math.max(0, bytesPerSecond) / divisors[unit];
  return `${value === 0 ? '0' : value.toLocaleString('en-US', { maximumFractionDigits:2, minimumFractionDigits:value < 10 ? 2 : 0 })} ${unit}`;
}
export function speedButton(bytesPerSecond, unit) {
  unit = speedUnit(unit);
  return `<button class="speed-value" data-action="speed-unit" title="Click to change speed units (${unit} → ${nextSpeedUnit(unit)})" aria-label="${formatSpeed(bytesPerSecond, unit)}. Change speed units to ${nextSpeedUnit(unit)}">${formatSpeed(bytesPerSecond, unit).replace(' ' + unit, ` <small>${unit}</small>`)}</button>`;
}
