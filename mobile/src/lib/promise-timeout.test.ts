import { settleWithin } from './promise-timeout';

describe('settleWithin', () => {
  afterEach(() => jest.useRealTimers());

  it('resolves after the deadline when cleanup never settles', async () => {
    jest.useFakeTimers();
    let finished = false;
    const result = settleWithin(new Promise(() => {}), 2000).then(() => {
      finished = true;
    });

    await jest.advanceTimersByTimeAsync(1999);
    expect(finished).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await result;
    expect(finished).toBe(true);
  });

  it('absorbs a cleanup rejection', async () => {
    await expect(settleWithin(Promise.reject(new Error('offline')), 2000)).resolves.toBeUndefined();
  });
});
