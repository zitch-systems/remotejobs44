const mockInsert = jest.fn();
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(() => ({ insert: mockInsert })) },
}));
jest.mock('./jobs', () => ({ fetchJobsByIds: jest.fn() }));

import { applyRemote } from './user-state';
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
