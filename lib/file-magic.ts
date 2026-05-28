// lib/file-magic.ts
//
// Magic-byte signatures for the file types CV upload accepts.
// Verified against the *actual* file bytes — never trust the client-
// supplied Content-Type header alone, since multipart uploads let the
// caller set it to anything. Without this, a user could ship
// <script>...</script> HTML labelled as application/pdf and have
// the signed-URL endpoint serve it with Content-Type: application/pdf
// in the response.
//
// Extracted from app/api/cv/route.ts so the detection is unit-testable.

export const MIME_PDF  = 'application/pdf';
export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MIME_DOC  = 'application/msword';

export function detectMagicMime(buf: Uint8Array): string | null {
  if (buf.length < 4) return null;

  // %PDF — PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return MIME_PDF;
  }

  // PK\x03\x04 — ZIP-family. Covers .docx, which is a zipped XML
  // bundle. (xlsx/pptx also start with this — out of scope for CV
  // upload so the route's MIME-equality check rejects them.)
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return MIME_DOCX;
  }

  // \xD0\xCF\x11\xE0 — legacy MS Office compound binary (.doc).
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) {
    return MIME_DOC;
  }

  return null;
}
