const mockInsert = jest.fn();
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(() => ({ insert: mockInsert })) },
}));
jest.mock('./jobs', () => ({ fetchJobsByIds: jest.fn() }));

import { applyRemote, mergeApplicationRows } from './user-state';
import type { Job } from './types';

it('does not persist gated employer identity in an application row', async () => {
  mockInsert.mockResolvedValue({ error: null });
  await applyRemote('user-1', {
    id: '11111111-1111-4111-8111-111111111111', role: 'Engineer', company: 'Private Employer',
  } as Job);
  expect(mockInsert).toHaveBeenCalledWith({
    user_id: 'user-1', job_id: '11111111-1111-4111-8111-111111111111', status: 'applied',
  });
});

it('retains an expired or inactive application as an unavailable tracker row', async () => {
  const items = mergeApplicationRows([{
      job_id: '22222222-2222-4222-8222-222222222222',
      job_title: 'Senior Engineer at [Hidden Company]', status: 'interview',
      notes: 'Follow up Friday', applied_at: '2026-09-01T00:00:00Z',
    }], []); // trusted public API omitted the inactive/expired job
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    status: 'interview', notes: 'Follow up Friday',
    job: {
      id: '22222222-2222-4222-8222-222222222222',
      role: 'Senior Engineer at [Hidden Company]',
      company: 'Hidden Company', unavailable: true,
    },
  });
  expect(items[0].job.applyUrl).toBeUndefined();
  expect(items[0].job.applyEmail).toBeUndefined();
});
