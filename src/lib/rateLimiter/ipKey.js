import { isIPv4, isIPv6 } from 'node:net';

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

// Expand an IPv6 address into its 8 hextets, e.g. "2001:db8::1" -> ["2001","db8","0",...,"1"]
const expandIPv6 = (ip) => {
  let addr = ip.split('%')[0]; // drop zone id (fe80::1%eth0)

  // Convert a trailing embedded IPv4 (e.g. ::1.2.3.4) into two hextets
  const v4 = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const [a, b, c, d] = v4[1].split('.').map(Number);
    addr =
      addr.slice(0, -v4[1].length) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const [head, tail] = addr.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail !== undefined && tail ? tail.split(':') : [];
  const fill = addr.includes('::') ? 8 - headParts.length - tailParts.length : 0;

  return [...headParts, ...Array(fill).fill('0'), ...tailParts].map((h) =>
    parseInt(h, 16).toString(16),
  );
};

/**
 * Turns a client IP into a stable rate limit key:
 *   - IPv4 is used as-is
 *   - IPv4-mapped IPv6 (::ffff:1.2.3.4) collapses to its IPv4 form
 *   - IPv6 is grouped by prefix (default /64) since one user/ISP customer
 *     typically owns the whole /64 and could otherwise rotate addresses
 */
export const ipToKey = (ip, ipv6Subnet = 64) => {
  if (!ip) return 'unknown';

  const mapped = ip.match(IPV4_MAPPED);
  if (mapped) return mapped[1];
  if (isIPv4(ip)) return ip;
  if (!isIPv6(ip.split('%')[0])) return ip;

  const hextets = expandIPv6(ip);
  const fullHextets = Math.floor(ipv6Subnet / 16);
  const remainderBits = ipv6Subnet % 16;

  const prefix = hextets.slice(0, fullHextets);
  if (remainderBits) {
    const mask = (0xffff << (16 - remainderBits)) & 0xffff;
    prefix.push((parseInt(hextets[fullHextets], 16) & mask).toString(16));
  }

  return `${prefix.join(':')}::/${ipv6Subnet}`;
};
