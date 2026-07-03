import { describe, it, expect } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  passwordChecks,
  validatePassword,
  friendlyAuthError,
} from './password';

describe('validatePassword', () => {
  it('accepts a password meeting all three rules', () => {
    expect(validatePassword('Password1')).toBeNull();
    expect(validatePassword('aB3xxxxx')).toBeNull();
  });

  it('rejects a password shorter than the minimum length', () => {
    expect(validatePassword('Ab3')).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
    // Exactly one under the boundary.
    expect(validatePassword('Abcdef1')).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  });

  it('accepts a password exactly at the minimum length', () => {
    expect(validatePassword('Abcdefg1')).toBeNull(); // 8 chars, upper, number
  });

  it('rejects a long password with no uppercase letter', () => {
    expect(validatePassword('password1')).toBe(
      'Password must include at least one uppercase letter',
    );
  });

  it('rejects a long password with no number', () => {
    expect(validatePassword('Passwords')).toBe(
      'Password must include at least one number',
    );
  });

  it('reports length before the character-class rules', () => {
    // Too short AND missing uppercase/number — length wins.
    expect(validatePassword('abc')).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  });
});

describe('passwordChecks', () => {
  it('flags each rule independently', () => {
    const checks = passwordChecks('Password1');
    expect(checks.every(c => c.pass)).toBe(true);
  });

  it('marks the meter partially for a weak-but-long password', () => {
    const checks = passwordChecks('password'); // long, no upper, no number
    const passed = checks.filter(c => c.pass).map(c => c.label);
    expect(passed).toEqual(['8+ characters']);
  });

  it('matches validatePassword: all checks pass iff validatePassword is null', () => {
    for (const pw of ['Password1', 'password', 'PASSWORD', 'Pass1', 'aB3xxxxx']) {
      const allPass = passwordChecks(pw).every(c => c.pass);
      expect(allPass).toBe(validatePassword(pw) === null);
    }
  });
});

describe('friendlyAuthError', () => {
  it('translates "already registered" into a login nudge', () => {
    expect(friendlyAuthError('User already registered')).toMatch(/already exists/i);
    expect(friendlyAuthError('Email address already exists')).toMatch(/already exists/i);
  });

  it('translates leaked / weak password rejections', () => {
    expect(
      friendlyAuthError('Password is known to be weak and easy to guess, please choose a different one.'),
    ).toMatch(/data breach|too common/i);
    expect(friendlyAuthError('This password has been pwned')).toMatch(/data breach|too common/i);
  });

  it('translates the reset-flow "same password" error without mislabeling it as weak', () => {
    const msg = friendlyAuthError('New password should be different from the old password.');
    expect(msg).toMatch(/different from your current/i);
    // Must NOT fall through to the strength branch's "stronger/longer/symbol" copy.
    expect(msg).not.toMatch(/stronger|symbol/i);
  });

  it('translates a stricter server strength policy without repeating met rules', () => {
    const msg = friendlyAuthError(
      'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, and symbols.',
    );
    expect(msg).toMatch(/stronger|longer|symbol/i);
  });

  it('translates rate-limit errors', () => {
    expect(friendlyAuthError('Email rate limit exceeded')).toMatch(/too many|wait/i);
    expect(friendlyAuthError('For security purposes, you can only request this after 32 seconds')).toMatch(/too many|wait/i);
  });

  it('translates invalid-email errors', () => {
    expect(friendlyAuthError('Unable to validate email address: invalid format')).toMatch(/valid email/i);
  });

  it('falls back to the raw message for unknown errors', () => {
    expect(friendlyAuthError('Some novel error')).toBe('Some novel error');
  });

  it('falls back to a generic message for empty / nullish input', () => {
    expect(friendlyAuthError('')).toMatch(/something went wrong/i);
    expect(friendlyAuthError(null)).toMatch(/something went wrong/i);
    expect(friendlyAuthError(undefined)).toMatch(/something went wrong/i);
  });
});
