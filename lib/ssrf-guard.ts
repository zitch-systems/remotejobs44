// lib/ssrf-guard.ts
// Blocks server-side fetches to internal/cloud-metadata hosts so an attacker
// who controls a `url` query param can't pivot from our edge function into
// AWS/GCP metadata or our private network.
//
// Used by /api/rss (and any future endpoint that fetches a user-supplied URL).

export interface UrlValidation {
  ok:   true;
  url:  URL;
}
export interface UrlError {
  ok:    false;
  error: string;
}

const BLOCKED_HOSTS = new Set([
  'localhost', '0.0.0.0', '127.0.0.1', '::1',
  'metadata.google.internal',
  '169.254.169.254',     // AWS / GCP / Azure IMDS
  '100.100.100.200',     // Alibaba metadata
  'metadata.azure.com',
]);

// Reject these IP ranges. These cover the IETF private blocks plus a few
// extras (CGNAT, link-local, broadcast).
function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;                       // 10.0.0.0/8
  if (a === 127) return true;                      // loopback
  if (a === 169 && b === 254) return true;         // link-local + AWS IMDS
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;         // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 0) return true;                        // 0.0.0.0/8
  if (a === 255) return true;                      // broadcast
  return false;
}

// True for any IPv6 address we must never connect to: loopback (::1),
// unspecified (::), unique-local (fc00::/7), link-local (fe80::/10), and
// IPv4-mapped/compat forms (::ffff:a.b.c.d, ::a.b.c.d) whose embedded v4 is
// itself private. Resolved AAAA records flow through here.
function isPrivateIPv6(addr: string): boolean {
  let ip = addr.toLowerCase().trim();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  // Strip a zone id (fe80::1%eth0) before classifying.
  const pct = ip.indexOf('%');
  if (pct !== -1) ip = ip.slice(0, pct);
  if (ip === '::1' || ip === '::') return true;
  // IPv4-mapped / -compatible: defer to the v4 classifier for the embedded addr.
  const mapped = ip.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true; // fe80::/10 link-local
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // fc00::/7 unique-local
  return false;
}

// Classify any resolved literal IP (v4 or v6) as private/unsafe.
function isPrivateIP(addr: string): boolean {
  return isPrivateIPv4(addr) || (addr.includes(':') && isPrivateIPv6(addr));
}

// Accept only http(s), reject private hosts, reject ipv6 (anything with ':' that
// isn't a port), reject obvious internal services. This is intentionally strict
// rather than smart — we'd rather block a few legit feeds than have an SSRF.
export function validateExternalUrl(raw: string): UrlValidation | UrlError {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http(s) URLs are allowed' };
  }

  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, error: 'Missing host' };

  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, error: 'Host is not allowed' };
  }

  // IPv6 — block any literal IPv6 hostname; we don't expect feeds at IPv6 addresses.
  if (host.startsWith('[') || host.includes(':')) {
    return { ok: false, error: 'IPv6 hosts are not allowed' };
  }

  if (isPrivateIPv4(host)) {
    return { ok: false, error: 'Private IP addresses are not allowed' };
  }

  // Reject any host ending in .local, .internal, .lan, etc. and the
  // .localhost suffix — RFC 6761 reserves the *.localhost TLD and
  // virtually every resolver (musl, glibc, libcurl) maps anything
  // under it to 127.0.0.1 / ::1. The earlier regex only caught
  // *.local exactly (the .localhost suffix slipped through, and DNS
  // then routed evil.localhost into our own loopback).
  if (/\.(local|internal|lan|intranet|corp|home|localhost)$/i.test(host)) {
    return { ok: false, error: 'Internal-only hosts are not allowed' };
  }

  return { ok: true, url };
}

// Async, DNS-aware variant. Runs the synchronous string checks above, then
// RESOLVES the hostname and rejects if ANY resolved A/AAAA address is private,
// link-local, or a cloud-metadata IP. The string-only `validateExternalUrl`
// can be defeated by a public hostname that resolves to an internal IP
// (e.g. `169.254.169.254.nip.io`, or an attacker's own domain whose DNS
// returns 10.x / 127.0.0.1) — DNS-rebinding / public-name-to-internal-IP SSRF.
// Use this for every server-side fetch of a non-allowlisted, externally
// influenced URL.
//
// Residual: native fetch/puppeteer do their own DNS lookup, so a record that
// flips between our resolve and the socket connect (true rebinding) is not
// fully closed without connect-time IP pinning (needs a custom dispatcher,
// which the runtime doesn't expose here). This check defeats the realistic
// static-record case; pin at connect time if undici becomes importable.
export async function validateExternalUrlAndResolve(raw: string): Promise<UrlValidation | UrlError> {
  const v = validateExternalUrl(raw);
  if (!v.ok) return v;

  let addrs: { address: string }[];
  try {
    // node:dns is only available on the Node runtime. Import lazily so this
    // module stays importable from Edge/client bundles that only use the
    // synchronous validator.
    const dns = await import('node:dns/promises');
    addrs = await dns.lookup(v.url.hostname, { all: true });
  } catch (err: any) {
    // NXDOMAIN / no address → nothing to fetch anyway; treat as blocked.
    return { ok: false, error: `DNS resolution failed: ${err?.code ?? err?.message ?? 'unknown'}` };
  }

  if (addrs.length === 0) {
    return { ok: false, error: 'Host did not resolve to any address' };
  }
  for (const { address } of addrs) {
    if (isPrivateIP(address)) {
      return { ok: false, error: `Host resolves to a disallowed address (${address})` };
    }
  }
  return { ok: true, url: v.url };
}
