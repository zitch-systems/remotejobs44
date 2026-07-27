import { describe, it, expect } from 'vitest';
import { shouldEndSessionOnRestart } from './remember';

// The storage wrappers need a DOM; this suite runs in the node environment, so
// it covers the decision itself — which is the part that can be wrong.
describe('shouldEndSessionOnRestart', () => {
  it('ends the session when a session-only sign-in outlives its browser run', () => {
    // localStorage flag survived, sessionStorage marker did not = browser closed.
    expect(shouldEndSessionOnRestart(true, false)).toBe(true);
  });

  it('keeps the session within the same browser run', () => {
    expect(shouldEndSessionOnRestart(true, true)).toBe(false);
  });

  it('never touches a session the user asked to be remembered', () => {
    expect(shouldEndSessionOnRestart(false, false)).toBe(false);
    expect(shouldEndSessionOnRestart(false, true)).toBe(false);
  });
});
