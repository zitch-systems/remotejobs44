let mockSupabaseConfigured = true;
jest.mock('@/lib/supabase', () => ({
  get isSupabaseConfigured() {
    return mockSupabaseConfigured;
  },
}));
jest.mock('@/lib/user-state', () => ({
  setSavedRemote: jest.fn(),
  applyRemote: jest.fn(),
  updateApplicationStatus: jest.fn(),
}));
jest.mock('@/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ notifySuccess: jest.fn(), tapLight: jest.fn() }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import { useAppStore } from './app';
import type { Job } from '@/lib/types';
import { applyRemote, setSavedRemote } from '@/lib/user-state';

const mockSetSavedRemote = setSavedRemote as jest.MockedFunction<typeof setSavedRemote>;
const mockApplyRemote = applyRemote as jest.MockedFunction<typeof applyRemote>;

const job = { id: '11111111-1111-4111-8111-111111111111', role: 'Engineer' } as Job;

function deferred<T = void>() {
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSupabaseConfigured = true;
  useAppStore.setState({ userId: null, saved: [], applied: {}, hydrated: false });
});

it.each([null, 'user-b'])('clears account-owned state when identity changes to %s', (nextUserId) => {
  useAppStore.setState({
    userId: 'user-a',
    saved: ['saved-a'],
    applied: { 'applied-a': 'interview' },
    hydrated: true,
  });

  useAppStore.getState().setUserId(nextUserId);

  expect(useAppStore.getState()).toMatchObject({
    userId: nextUserId,
    saved: [],
    applied: {},
    hydrated: false,
  });
});

it('does not disturb hydrated state when the same user is reported again', () => {
  const saved = ['saved-a'];
  const applied = { 'applied-a': 'offer' as const };
  useAppStore.setState({ userId: 'user-a', saved, applied, hydrated: true });

  useAppStore.getState().setUserId('user-a');

  expect(useAppStore.getState()).toMatchObject({ userId: 'user-a', hydrated: true });
  expect(useAppStore.getState().saved).toBe(saved);
  expect(useAppStore.getState().applied).toBe(applied);
});

it('preserves seeded and hydrated state in demo mode', () => {
  const saved = ['demo-saved'];
  const applied = { 'demo-applied': 'applied' as const };
  mockSupabaseConfigured = false;
  useAppStore.setState({ userId: null, saved, applied, hydrated: true });

  useAppStore.getState().setUserId('demo-user');

  expect(useAppStore.getState()).toMatchObject({ userId: 'demo-user', hydrated: true });
  expect(useAppStore.getState().saved).toBe(saved);
  expect(useAppStore.getState().applied).toBe(applied);
});

it('ignores an old user save rollback that rejects after an account switch', async () => {
  const pending = deferred();
  mockSetSavedRemote.mockReturnValueOnce(pending.promise);
  useAppStore.setState({ userId: 'user-a', saved: [], applied: {}, hydrated: true });
  useAppStore.getState().toggleSaved(job.id);

  useAppStore.getState().setUserId('user-b');
  useAppStore.setState({ saved: [job.id], hydrated: true });
  pending.reject(new Error('late failure'));
  await Promise.resolve();
  await Promise.resolve();

  expect(useAppStore.getState()).toMatchObject({
    userId: 'user-b',
    saved: [job.id],
    hydrated: true,
  });
});

it('ignores an old user apply rollback that rejects after an account switch', async () => {
  const pending = deferred();
  mockApplyRemote.mockReturnValueOnce(pending.promise);
  useAppStore.setState({ userId: 'user-a', saved: [], applied: {}, hydrated: true });
  useAppStore.getState().applyTo(job);

  useAppStore.getState().setUserId('user-b');
  useAppStore.setState({ applied: { [job.id]: 'interview' }, hydrated: true });
  pending.reject(new Error('late failure'));
  await Promise.resolve();
  await Promise.resolve();

  expect(useAppStore.getState()).toMatchObject({
    userId: 'user-b',
    applied: { [job.id]: 'interview' },
    hydrated: true,
  });
});

describe('applyTo result', () => {
  it('resolves true once the application is recorded', async () => {
    mockApplyRemote.mockResolvedValueOnce(undefined);
    useAppStore.setState({ userId: 'user-a', applied: {}, hydrated: true });

    await expect(useAppStore.getState().applyTo(job)).resolves.toBe(true);

    expect(mockApplyRemote).toHaveBeenCalledWith('user-a', job);
    expect(useAppStore.getState().applied).toEqual({ [job.id]: 'applied' });
  });

  it('tracks optimistically before the write finishes', () => {
    mockApplyRemote.mockReturnValueOnce(new Promise(() => {}));
    useAppStore.setState({ userId: 'user-a', applied: {}, hydrated: true });

    void useAppStore.getState().applyTo(job);

    expect(useAppStore.getState().applied).toEqual({ [job.id]: 'applied' });
  });

  it('resolves false and rolls the application back when the write fails', async () => {
    mockApplyRemote.mockRejectedValueOnce(new Error('free_trial_exhausted'));
    useAppStore.setState({ userId: 'user-a', applied: {}, hydrated: true });

    await expect(useAppStore.getState().applyTo(job)).resolves.toBe(false);

    expect(useAppStore.getState().applied).toEqual({});
  });

  it('resolves false without writing again for a job that is already tracked', async () => {
    useAppStore.setState({ userId: 'user-a', applied: { [job.id]: 'interview' }, hydrated: true });

    await expect(useAppStore.getState().applyTo(job)).resolves.toBe(false);

    expect(mockApplyRemote).not.toHaveBeenCalled();
    expect(useAppStore.getState().applied).toEqual({ [job.id]: 'interview' });
  });

  it('resolves true in demo mode, where there is nothing to persist', async () => {
    mockSupabaseConfigured = false;
    useAppStore.setState({ userId: null, applied: {}, hydrated: true });

    await expect(useAppStore.getState().applyTo(job)).resolves.toBe(true);

    expect(mockApplyRemote).not.toHaveBeenCalled();
  });
});
