import { describe, it, expect } from 'vitest';
import { validateExternalUrl } from './ssrf-guard';

// Pins the SSRF allow-list for validateExternalUrl. This is the gate
// that protects every server-side fetch of a user/admin-supplied URL
// (admin-added job sources in /admin/sources, the ingest pipeline's
// user-source loop, the RSS feed reader, and any future scraper).
//
// The threat: an attacker who can supply a `url` field tricks our
// server into fetching internal services (cloud metadata, private
// subnets, localhost admin panels) — the response then either flows
// back to them or has side effects on internal systems.

describe('validateExternalUrl', () => {
  describe('accepts public http(s) URLs', () => {
    it.each([
      ['https://remotive.com/api/remote-jobs'],
      ['http://example.com/feed.xml'],
      ['https://api.example.com/jobs.json?limit=50'],
      ['https://example.com:8080/path'],
      ['https://sub.example.com/path'],
    ])('accepts %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(true);
    });
  });

  describe('rejects non-http schemes', () => {
    it.each([
      ['ftp://example.com/'],
      ['gopher://example.com/'],
      ['file:///etc/passwd'],
      ['javascript:alert(1)'],
      ['data:text/html,xss'],
      ['ws://example.com/'],
      ['wss://example.com/'],
    ])('rejects %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(false);
    });
  });

  describe('rejects malformed URLs', () => {
    it.each([
      [''],
      ['not-a-url'],
      ['http://'],
    ])('rejects %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(false);
    });
  });

  describe('blocks loopback', () => {
    it.each([
      ['http://localhost/'],
      ['http://127.0.0.1/'],
      ['http://127.0.0.1:3000/'],
      ['http://0.0.0.0/'],
    ])('rejects %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(false);
    });
  });

  describe('blocks cloud-metadata endpoints', () => {
    // The big-ticket SSRF target — IMDS gives credentials away on AWS,
    // GCP, Azure, Alibaba if reachable.
    it.each([
      ['http://169.254.169.254/latest/meta-data/'],
      ['http://metadata.google.internal/computeMetadata/v1/'],
      ['http://metadata.azure.com/'],
      ['http://100.100.100.200/latest/meta-data/'], // Alibaba
    ])('rejects %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(false);
    });
  });

  describe('blocks RFC-1918 private ranges', () => {
    it.each([
      ['http://10.0.0.1/'],
      ['http://10.255.255.255/'],
      ['http://172.16.0.1/'],
      ['http://172.20.5.5/'],
      ['http://172.31.255.255/'],
      ['http://192.168.0.1/'],
      ['http://192.168.255.255/'],
    ])('rejects %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(false);
    });
  });

  describe('does NOT block public 172.x that fall outside /12', () => {
    // 172.0-15 and 172.32-255 are public — the private block is
    // strictly 172.16.0.0/12. A naive `startsWith('172.')` would over-
    // block legitimate AWS / DigitalOcean IPs.
    it.each([
      ['http://172.15.0.1/'],
      ['http://172.32.0.1/'],
      ['http://172.215.0.1/'],
    ])('accepts %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(true);
    });
  });

  describe('blocks CGNAT range', () => {
    // 100.64.0.0/10 — carrier-grade NAT, usually internal to ISPs but
    // sometimes routable inside cloud VPCs.
    it.each([
      ['http://100.64.0.1/'],
      ['http://100.127.255.255/'],
    ])('rejects %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(false);
    });
  });

  describe('does NOT block public 100.x outside CGNAT', () => {
    it.each([
      ['http://100.63.0.1/'],   // below CGNAT
      ['http://100.128.0.1/'],  // above CGNAT
    ])('accepts %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(true);
    });
  });

  describe('blocks all IPv6 literals', () => {
    // Conservative: we don't expect feeds at IPv6 addresses, and
    // distinguishing public vs private IPv6 is far more error-prone
    // than IPv4. Whitelist when an actual need shows up.
    it.each([
      ['http://[::1]/'],
      ['http://[fe80::1]/'],
      ['http://[2001:db8::1]/'],
    ])('rejects %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(false);
    });
  });

  describe('blocks internal-only TLDs', () => {
    it.each([
      ['http://router.local/'],
      ['http://server.internal/'],
      ['http://machine.lan/'],
      ['http://intranet.corp/'],
      ['http://nas.home/'],
    ])('rejects %s', (u) => {
      const r = validateExternalUrl(u);
      expect(r.ok).toBe(false);
    });
  });

  describe('preserves the parsed URL for accepted inputs', () => {
    it('returns a URL object the caller can re-stringify safely', () => {
      const r = validateExternalUrl('https://Example.COM/Path?q=1');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.url.hostname).toBe('example.com'); // URL normalises
        expect(r.url.protocol).toBe('https:');
      }
    });
  });
});
