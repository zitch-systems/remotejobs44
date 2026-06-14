// lib/whatsapp.ts — single source of truth for the support WhatsApp link.
//
// Why this exists (security + correctness):
//   * The number used to be hard-coded as a raw `https://wa.me/2349169582776`
//     string in 5+ components. One audited constant means a tampered or
//     typo'd number can't silently slip into a single call site and quietly
//     redirect prospects to an attacker's chat ("deep-link hijacking").
//   * `waLink()` URL-encodes any pre-filled message, so a message built from
//     dynamic data can never break out of the URL or inject extra query
//     params (`&` / line breaks / `?` smuggling).
//   * Callers must keep target="_blank" rel="noopener noreferrer" on the
//     anchor — see SECURITY_SEO_AUDIT_2026.md.
//
// This is a click-to-chat DEEP LINK, not the WhatsApp Business API. If/when
// the platform adds inbound messaging, the webhook-signature (X-Hub-
// Signature-256) + backend-proxy pattern is documented in the audit file.

// E.164 digits only (no '+', no spaces) — the format wa.me expects.
export const WHATSAPP_NUMBER = '2349169582776';

// Human-readable form for display next to the link.
export const WHATSAPP_DISPLAY = '+234 916 958 2776';

/**
 * Build a safe https://wa.me click-to-chat URL.
 * @param message optional pre-filled text; URL-encoded before it touches the URL.
 */
export function waLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
