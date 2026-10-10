const mockUnsubscribe = jest.fn();
let mockHandler: ((event: string, session: unknown) => void) | undefined;

jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn((handler: (event: string, session: unknown) => void) => {
        mockHandler = handler;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      }),
    },
  },
}));

import { onSessionChange } from './session-change';

beforeEach(() => {
  mockHandler = undefined;
  mockUnsubscribe.mockClear();
});

describe('onSessionChange', () => {
  it('ignores the INITIAL_SESSION replay every new subscriber receives', () => {
    const onChange = jest.fn();
    onSessionChange(onChange);

    mockHandler?.('INITIAL_SESSION', { access_token: 'token' });
    mockHandler?.('INITIAL_SESSION', null);

    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY'])(
    'reports %s as a session change',
    (event) => {
      const onChange = jest.fn();
      onSessionChange(onChange);

      mockHandler?.(event, null);

      expect(onChange).toHaveBeenCalledTimes(1);
    },
  );

  it('hands back an unsubscribe for the underlying auth subscription', () => {
    const unsubscribe = onSessionChange(jest.fn());
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    unsubscribe();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
