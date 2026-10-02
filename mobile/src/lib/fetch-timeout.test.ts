import { fetchWithTimeout } from './fetch-timeout';

describe('fetchWithTimeout', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('aborts the underlying request at the deadline', async () => {
    jest.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    globalThis.fetch = jest.fn((_input, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }) as typeof fetch;

    const result = fetchWithTimeout('https://example.test', undefined, 100);
    const rejected = expect(result).rejects.toThrow('aborted');
    await jest.advanceTimersByTimeAsync(100);
    await rejected;
    expect(requestSignal?.aborted).toBe(true);
  });

  it('preserves an external abort signal', async () => {
    const external = new AbortController();
    globalThis.fetch = jest.fn((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('caller aborted')), { once: true });
      }),
    ) as typeof fetch;

    const result = fetchWithTimeout('https://example.test', { signal: external.signal });
    const rejected = expect(result).rejects.toThrow('caller aborted');
    external.abort();
    await rejected;
  });
});
