import { describe, it, expect } from 'vitest';
import { detectMagicMime, MIME_PDF, MIME_DOC, MIME_DOCX } from './file-magic';

function bytes(...nums: number[]): Uint8Array {
  return new Uint8Array(nums);
}

describe('detectMagicMime', () => {
  it('detects PDF (%PDF prefix)', () => {
    // Real PDFs start "%PDF-1.4\n..."
    expect(detectMagicMime(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34)))
      .toBe(MIME_PDF);
  });

  it('detects docx (PK\\x03\\x04 ZIP prefix)', () => {
    expect(detectMagicMime(bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00)))
      .toBe(MIME_DOCX);
  });

  it('detects legacy .doc (compound binary)', () => {
    expect(detectMagicMime(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)))
      .toBe(MIME_DOC);
  });

  it('returns null for HTML labelled as PDF — the attack we are guarding against', () => {
    // The exact regression we are protecting against: caller sets
    // Content-Type: application/pdf but the bytes are <html>...
    const html = new TextEncoder().encode('<html><body>not a pdf</body></html>');
    expect(detectMagicMime(html)).toBeNull();
  });

  it('returns null for plaintext', () => {
    const txt = new TextEncoder().encode('Just plain text in a file.');
    expect(detectMagicMime(txt)).toBeNull();
  });

  it('returns null for truncated input (< 4 bytes)', () => {
    expect(detectMagicMime(bytes(0x25, 0x50, 0x44))).toBeNull();
    expect(detectMagicMime(bytes())).toBeNull();
  });

  it('does NOT misidentify a docx whose ZIP signature has been altered', () => {
    // Off-by-one — wrong second byte. Should fail PK check.
    expect(detectMagicMime(bytes(0x50, 0x4c, 0x03, 0x04))).toBeNull();
  });

  it('exposes MIME constants matching the route allowlist', () => {
    expect(MIME_PDF).toBe('application/pdf');
    expect(MIME_DOCX).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(MIME_DOC).toBe('application/msword');
  });
});
