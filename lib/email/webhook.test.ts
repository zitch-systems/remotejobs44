import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyResendSignature, isPermanentBounce, recipientsOf } from './webhook';

const SECRET = 'whsec_' + Buffer.from('super-secret-key-material').toString('base64');
const ID     = 'msg_2abc';
const BODY   = JSON.stringify({ type: 'email.bounced', data: { to: ['a@b.com'] } });

/** Produce the header set Svix would send for this body at `tsSeconds`. */
function sign(body: string, tsSeconds: number, secret = SECRET, id = ID) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${tsSeconds}.${body}`).digest('base64');
  return { id, timestamp: String(tsSeconds), signature: `v1,${sig}` };
}

describe('verifyResendSignature', () => {
  const NOW_MS = 1_700_000_000_000;
  const NOW_S  = NOW_MS / 1000;

  it('accepts a correctly signed payload', () => {
    expect(verifyResendSignature(BODY, sign(BODY, NOW_S), SECRET, NOW_MS)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const headers = sign(BODY, NOW_S);
    const tampered = JSON.stringify({ type: 'email.complained', data: { to: ['victim@b.com'] } });
    expect(verifyResendSignature(tampered, headers, SECRET, NOW_MS)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const other = 'whsec_' + Buffer.from('attacker-key').toString('base64');
    expect(verifyResendSignature(BODY, sign(BODY, NOW_S, other), SECRET, NOW_MS)).toBe(false);
  });

  // Replay: a valid capture re-sent hours later must not still be accepted.
  it('rejects a stale timestamp', () => {
    const old = NOW_S - 60 * 60;
    expect(verifyResendSignature(BODY, sign(BODY, old), SECRET, NOW_MS)).toBe(false);
  });

  it('rejects a far-future timestamp', () => {
    const future = NOW_S + 60 * 60;
    expect(verifyResendSignature(BODY, sign(BODY, future), SECRET, NOW_MS)).toBe(false);
  });

  it('accepts a timestamp inside the tolerance window', () => {
    const recent = NOW_S - 60;
    expect(verifyResendSignature(BODY, sign(BODY, recent), SECRET, NOW_MS)).toBe(true);
  });

  // The signature is bound to the message id, so an attacker can't lift a
  // valid digest onto a different delivery.
  it('rejects a signature bound to a different message id', () => {
    const headers = sign(BODY, NOW_S, SECRET, 'msg_other');
    expect(verifyResendSignature(BODY, { ...headers, id: ID }, SECRET, NOW_MS)).toBe(false);
  });

  it('matches any v1 entry when several are present (secret rotation)', () => {
    const good = sign(BODY, NOW_S);
    const headers = { ...good, signature: `v1,AAAAinvalidAAAA ${good.signature}` };
    expect(verifyResendSignature(BODY, headers, SECRET, NOW_MS)).toBe(true);
  });

  it('ignores non-v1 versions', () => {
    const good = sign(BODY, NOW_S);
    const headers = { ...good, signature: good.signature.replace('v1,', 'v2,') };
    expect(verifyResendSignature(BODY, headers, SECRET, NOW_MS)).toBe(false);
  });

  // An unset secret must fail closed — never treat "no secret configured"
  // as "everything is authentic".
  it('rejects when the secret is unset', () => {
    expect(verifyResendSignature(BODY, sign(BODY, NOW_S), undefined, NOW_MS)).toBe(false);
    expect(verifyResendSignature(BODY, sign(BODY, NOW_S), '', NOW_MS)).toBe(false);
  });

  it('rejects when headers are missing', () => {
    expect(verifyResendSignature(BODY, { id: null, timestamp: null, signature: null }, SECRET, NOW_MS)).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    const headers = { ...sign(BODY, NOW_S), timestamp: 'not-a-number' };
    expect(verifyResendSignature(BODY, headers, SECRET, NOW_MS)).toBe(false);
  });
});

describe('isPermanentBounce', () => {
  it('is true for a permanent bounce', () => {
    expect(isPermanentBounce({ type: 'Permanent', subType: 'NoEmail' })).toBe(true);
    expect(isPermanentBounce({ type: 'permanent' })).toBe(true);
  });

  // Soft bounces recover on their own; flagging them would strand a
  // paying user who simply had a full mailbox that afternoon.
  it('is false for transient and undetermined bounces', () => {
    expect(isPermanentBounce({ type: 'Transient', subType: 'MailboxFull' })).toBe(false);
    expect(isPermanentBounce({ type: 'Undetermined' })).toBe(false);
  });

  it('is false for missing or malformed input', () => {
    expect(isPermanentBounce(undefined)).toBe(false);
    expect(isPermanentBounce(null)).toBe(false);
    expect(isPermanentBounce({})).toBe(false);
    expect(isPermanentBounce({ type: 42 })).toBe(false);
  });
});

describe('recipientsOf', () => {
  it('normalises an array of recipients', () => {
    expect(recipientsOf({ to: ['  A@B.com ', 'c@d.com'] })).toEqual(['a@b.com', 'c@d.com']);
  });

  it('accepts a bare string', () => {
    expect(recipientsOf({ to: 'A@B.com' })).toEqual(['a@b.com']);
  });

  it('returns empty for missing or malformed recipients', () => {
    expect(recipientsOf({})).toEqual([]);
    expect(recipientsOf(null)).toEqual([]);
    expect(recipientsOf({ to: [] })).toEqual([]);
    expect(recipientsOf({ to: [123, null] })).toEqual([]);
  });
});
