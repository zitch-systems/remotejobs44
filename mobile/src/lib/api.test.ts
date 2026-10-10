const mockGetSession = jest.fn();
jest.mock('./supabase', () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

import { ApiError, apiErrorMessage, apiFetch, apiUrl, toApiError } from './api';

describe('apiUrl', () => {
  it('joins the API origin and a path with or without a leading slash', () => {
    expect(apiUrl('/api/profile')).toBe('https://remotejobs44.com/api/profile');
    expect(apiUrl('api/profile')).toBe('https://remotejobs44.com/api/profile');
  });
});

describe('apiFetch', () => {
  const realFetch = globalThis.fetch;
  const mockFetch = jest.fn();
  beforeEach(() => {
    mockFetch.mockReset().mockResolvedValue({ ok: true } as Response);
    mockGetSession.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it('sends the session access token as a Bearer header', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } });

    await apiFetch('/api/profile', { method: 'PATCH', body: '{"bio":"hi"}' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://remotejobs44.com/api/profile');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"bio":"hi"}');
    expect((init.headers as Headers).get('authorization')).toBe('Bearer jwt-123');
    expect((init.headers as Headers).get('accept')).toBe('application/json');
  });

  it('sends no Authorization header when signed out', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await apiFetch('/api/jobs');
    expect((mockFetch.mock.calls[0][1].headers as Headers).has('authorization')).toBe(false);
  });
});

describe('apiErrorMessage', () => {
  it('passes the server’s own 4xx message through', () => {
    expect(apiErrorMessage(403, { error: ' CV upload is a Pro feature. ' }, 'fallback')).toBe('CV upload is a Pro feature.');
    expect(apiErrorMessage(400, { error: 'Bio must be 2,000 characters or fewer' }, 'fallback')).toBe('Bio must be 2,000 characters or fewer');
    expect(apiErrorMessage(429, { error: 'Too many uploads. Try again later.' }, 'fallback')).toBe('Too many uploads. Try again later.');
  });

  it('replaces a 401’s wording and never shows 5xx details', () => {
    expect(apiErrorMessage(401, { error: 'Unauthorized' }, 'fallback')).toBe('Please sign in again.');
    expect(apiErrorMessage(500, { error: 'duplicate key value violates …' }, 'fallback')).toBe('fallback');
    expect(apiErrorMessage(503, { error: 'x' }, 'fallback')).toBe('fallback');
  });

  it('falls back when there is no usable message', () => {
    expect(apiErrorMessage(400, null, 'fallback')).toBe('fallback');
    expect(apiErrorMessage(400, 'plain text', 'fallback')).toBe('fallback');
    expect(apiErrorMessage(400, { error: '   ' }, 'fallback')).toBe('fallback');
    expect(apiErrorMessage(400, { error: 42 }, 'fallback')).toBe('fallback');
  });
});

describe('toApiError', () => {
  it('keeps the status and the server message', async () => {
    const err = await toApiError({ status: 403, json: async () => ({ error: 'Account suspended' }) } as Response, 'fallback');
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.message).toBe('Account suspended');
  });

  it('uses the fallback when the body is not JSON', async () => {
    const err = await toApiError({ status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } } as unknown as Response, 'Try again.');
    expect(err.status).toBe(502);
    expect(err.message).toBe('Try again.');
  });
});
