/** Keep supplied HTTPS brand images; never guess a company's domain. */
export function safeLogoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}
