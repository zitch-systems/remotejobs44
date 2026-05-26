// lib/safe-url.ts — guard against javascript:/data: scheme XSS.
//
// applyUrl values come from third-party ATS feeds (52 platforms, some of
// them user-edited career-page widgets). A malicious or compromised feed
// could return applyUrl: "javascript:alert(document.cookie)" or
// "data:text/html;base64,...". window.open() will happily execute these
// in the *current* page's origin even with noopener/noreferrer — the
// `rel` attributes only affect window.opener references, not scheme
// behaviour. We must filter by scheme before opening.

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

export function isSafeOpenUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return SAFE_SCHEMES.has(u.protocol.toLowerCase());
  } catch {
    return false;
  }
}

// Convenience: open a URL if and only if its scheme is safe. Drops the
// open silently for unsafe schemes — callers can also use isSafeOpenUrl
// directly to surface an error to the user instead.
export function safeWindowOpen(url: string | null | undefined): boolean {
  if (!isSafeOpenUrl(url)) {
    console.warn('[safeWindowOpen] refused unsafe url:', url);
    return false;
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}
