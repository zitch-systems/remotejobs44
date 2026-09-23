import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchATSJobs } from './ats-engine';

afterEach(() => vi.unstubAllGlobals());

describe('Ashby public board import', () => {
  it('requests the complete encoded board and preserves remote hiring-location text', async () => {
    const upstream = vi.fn(async () => Response.json({
      name: 'Scale Army Careers',
      jobs: [
        {
          id: 'one', title: 'Product Manager', isListed: true, isRemote: true,
          location: 'Nigeria, South Africa', jobUrl: 'https://jobs.ashbyhq.com/scale%20army%20careers/one',
        },
        { id: 'hidden', title: 'Unlisted role', isListed: false, isRemote: true },
      ],
    }));
    vi.stubGlobal('fetch', upstream);

    const result = await fetchATSJobs('ashby', 'scale%20army%20careers', '');

    expect(upstream).toHaveBeenCalledWith(
      'https://api.ashbyhq.com/posting-api/job-board/scale%20army%20careers?includeCompensation=true',
      expect.any(Object),
    );
    expect(result.error).toBeUndefined();
    expect(result.total).toBe(1);
    expect(result.jobs[0]).toMatchObject({
      title: 'Product Manager', remote: true, location: 'Nigeria, South Africa',
      sourceUrl: 'https://api.ashbyhq.com/posting-api/job-board/scale%20army%20careers?includeCompensation=true',
    });
  });
});
