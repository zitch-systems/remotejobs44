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

  // Reject any host ending in .local, .internal, .lan, etc.
  if (/\.(local|internal|lan|intranet|corp|home)$/i.test(host)) {
    return { ok: false, error: 'Internal-only hosts are not allowed' };
  }

  return { ok: true, url };
}
