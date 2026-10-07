// Shared by passive collectors and the dashboard; never performs a lookup.
export function parseAddress(input) {
  let text = String(input ?? '').toLowerCase().replace(/^\[|\]$/g, '');
  if (text.includes('%')) text = text.split('%')[0];
  const ipv4 = value => {
    const parts = value.split('.');
    return parts.length === 4 && parts.every(p => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255)
      ? parts.reduce((value, part) => (value << 8n) + BigInt(part), 0n) : null;
  };
  if (!text.includes(':')) {
    const value = ipv4(text);
    return value === null ? null : {bits:32, value, key:text};
  }
  if (text.includes('.')) {
    const end = text.lastIndexOf(':'), value = ipv4(text.slice(end + 1));
    if (value === null) return null;
    text = text.slice(0, end + 1) + (value >> 16n).toString(16) + ':' + (value & 65535n).toString(16);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const parts = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right];
  if (parts.length !== 8 || parts.some(p => !/^[0-9a-f]{1,4}$/.test(p))) return null;
  const value = parts.reduce((value, part) => (value << 16n) + BigInt('0x' + part), 0n);
  if (value >> 32n === 65535n) {
    const mapped = value & 0xffffffffn;
    return {bits:32, value:mapped, key:[24n,16n,8n,0n].map(shift => Number(mapped >> shift & 255n)).join('.')};
  }
  return {bits:128, value, key:parts.map(p => p.padStart(4, '0')).join(':')};
}
export const addressKey = address => parseAddress(address)?.key ?? String(address ?? '').toLowerCase();

export function parsePrefix(cidr) {
  const [address, prefix, extra] = cidr.split('/'), parsed = parseAddress(address), length = Number(prefix);
  if (!parsed || extra !== undefined || !/^\d+$/.test(prefix ?? '') || length < 0 || length > parsed.bits) throw new Error('Invalid network prefix: ' + cidr);
  const shift = BigInt(parsed.bits - length);
  return {...parsed, length, shift, network:parsed.value >> shift};
}
export const inPrefix = (address, prefix) => address?.bits === prefix.bits && address.value >> prefix.shift === prefix.network;
export function formatEndpoint(address,port) {
  const host=String(address??'');return `${host.includes(':')?'['+host+']':host}${port?':'+port:''}`;
}
