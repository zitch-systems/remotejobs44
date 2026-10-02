const DEFAULT_TIMEOUT_MS = 10_000;

/** Fetch with a real AbortController deadline while preserving caller aborts. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abort = () => controller.abort();

  if (callerSignal?.aborted) abort();
  else callerSignal?.addEventListener('abort', abort, { once: true });

  const timer = setTimeout(abort, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abort);
  }
}
