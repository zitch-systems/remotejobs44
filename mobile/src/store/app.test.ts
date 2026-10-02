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
