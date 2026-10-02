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
