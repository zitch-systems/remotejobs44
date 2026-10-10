import { parseOAuthAvailability } from './oauth-availability';

describe('parseOAuthAvailability', () => {
  it('enables only providers explicitly enabled by GoTrue', () => {
    expect(parseOAuthAvailability({ external: { google: true, linkedin_oidc: false } })).toEqual({
      google: true,
      linkedin_oidc: false,
    });
    expect(parseOAuthAvailability({ external: {} })).toEqual({ google: false, linkedin_oidc: false });
  });
});

describe('getOAuthAvailability', () => {
  const SAFE_DEFAULTS = { google: true, linkedin_oidc: false };
  const settings = (body: unknown, ok = true) => ({ ok, json: async () => body });
  let fetchMock: jest.Mock;
  let getOAuthAvailability: typeof import('./oauth-availability').getOAuthAvailability;

  beforeEach(() => {
    // The probe memoises at module scope, so load a fresh copy per test.
    jest.resetModules();
    fetchMock = jest.fn();
    jest.doMock('./fetch-timeout', () => ({ fetchWithTimeout: fetchMock }));
    ({ getOAuthAvailability } = require('./oauth-availability'));
  });

  it('retries after a failed probe instead of pinning the safe defaults', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network request failed'));
    fetchMock.mockResolvedValueOnce(settings({ external: { google: true, linkedin_oidc: true } }));

    await expect(getOAuthAvailability('https://x.supabase.co', 'anon')).resolves.toEqual(SAFE_DEFAULTS);
    await expect(getOAuthAvailability('https://x.supabase.co', 'anon')).resolves.toEqual({
      google: true,
      linkedin_oidc: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not remember an error response either', async () => {
    fetchMock.mockResolvedValueOnce(settings({}, false));
    fetchMock.mockResolvedValueOnce(settings({ external: { google: false, linkedin_oidc: true } }));

    await expect(getOAuthAvailability('https://x.supabase.co', 'anon')).resolves.toEqual(SAFE_DEFAULTS);
    await expect(getOAuthAvailability('https://x.supabase.co', 'anon')).resolves.toEqual({
      google: false,
      linkedin_oidc: true,
    });
  });

  it('shares one in-flight request and keeps a successful answer', async () => {
    fetchMock.mockResolvedValue(settings({ external: { google: true, linkedin_oidc: true } }));

    const [first, second] = await Promise.all([
      getOAuthAvailability('https://x.supabase.co', 'anon'),
      getOAuthAvailability('https://x.supabase.co', 'anon'),
    ]);
    const third = await getOAuthAvailability('https://x.supabase.co', 'anon');

    expect(first).toEqual({ google: true, linkedin_oidc: true });
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('answers without a request when the client is not configured', async () => {
    await expect(getOAuthAvailability('', '')).resolves.toEqual({ google: true, linkedin_oidc: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
