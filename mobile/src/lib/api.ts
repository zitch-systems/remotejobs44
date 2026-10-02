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
