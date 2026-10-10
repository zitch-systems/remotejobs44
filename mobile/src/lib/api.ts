import { supabase } from './supabase';

const DEFAULT_API_ORIGIN = 'https://remotejobs44.com';

export function apiUrl(path: string): string {
  const origin = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_ORIGIN).replace(/\/$/, '');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Fetch the trusted web API with the native Supabase session when present. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(apiUrl(path), { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}

/** An API failure: the HTTP status plus a message that is safe to show the user. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * What to tell the user about a failed API call. The web routes write their 4xx
 * `error` strings for end users ("CV upload is a Pro feature…"), so those pass
 * through; a 401's wording ("Unauthorized") and anything 5xx are replaced.
 */
export function apiErrorMessage(status: number, body: unknown, fallback: string): string {
  if (status === 401) return 'Please sign in again.';
  const text = status < 500 && body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  return typeof text === 'string' && text.trim() ? text.trim() : fallback;
}

/** Turn a non-OK response into an ApiError. */
export async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  return new ApiError(res.status, apiErrorMessage(res.status, body, fallback));
}
