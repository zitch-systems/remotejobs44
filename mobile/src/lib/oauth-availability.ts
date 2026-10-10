import { fetchWithTimeout } from './fetch-timeout';

export interface OAuthAvailability {
  google: boolean;
  linkedin_oidc: boolean;
}

const SAFE_DEFAULTS: OAuthAvailability = { google: true, linkedin_oidc: false };

export function parseOAuthAvailability(value: unknown): OAuthAvailability {
  const external = (value as { external?: Record<string, unknown> } | null)?.external;
  return {
    google: external?.google === true,
    linkedin_oidc: external?.linkedin_oidc === true,
  };
}

let cached: Promise<OAuthAvailability> | undefined;

/**
 * Read public GoTrue provider flags; failures keep Google and fail LinkedIn
 * closed. Only a successful read is remembered: a cold start while offline (or
 * a timeout / 5xx) answers this call with the safe defaults but is forgotten,
 * so the next call retries instead of hiding LinkedIn until the app restarts.
 */
export function getOAuthAvailability(url: string, anonKey: string): Promise<OAuthAvailability> {
  if (!url || !anonKey) return Promise.resolve({ google: true, linkedin_oidc: true });
  if (!cached) {
    const request: Promise<OAuthAvailability> = fetchWithTimeout(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not read authentication settings.');
        return parseOAuthAvailability(await response.json());
      })
      .catch(() => {
        if (cached === request) cached = undefined;
        return SAFE_DEFAULTS;
      });
    cached = request;
  }
  return cached;
}
