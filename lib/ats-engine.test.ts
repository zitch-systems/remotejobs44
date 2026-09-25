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

describe('ATS listing metadata', () => {
  it('reads Greenhouse board name and any included pay without per-job requests', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/jobs?content=true')) return Response.json({ jobs: [
        { id: 42, title: 'Engineer', content: '<p>Build things</p>', location: { name: 'Remote' },
          pay_input_ranges: [{ title: 'Annual Base Salary', currency_type: 'EUR', min_cents: 10000000, max_cents: 13000000 }] },
      ] });
      if (url.endsWith('/boards/example')) return Response.json({ name: 'Example Incorporated' });
      throw new Error(url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchATSJobs('greenhouse', 'example', '');
    expect(result.complete).toBe(true);
    expect(result.jobs[0]).toMatchObject({ company: 'Example Incorporated', salaryMin: 100000,
      salaryMax: 130000, currency: 'EUR', workplaceType: 'remote' });
    expect(result.jobs[0].logo).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps Lever list, closing text and nonannual salary evidence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ id: 'one', text: 'Engineer',
      description: '<p>Opening</p>', lists: [{ text: 'Relocation', content: '<li>Visa support</li>' }],
      additional: '<p>Closing</p>', workplaceType: 'hybrid',
      salaryRange: { min: 50, max: 70, currency: 'USD', interval: 'per-hour-wage' },
      salaryDescriptionPlain: '$50 to $70 hourly' }])));
    const result = await fetchATSJobs('lever', 'example', '');
    expect(result.jobs[0]).toMatchObject({ workplaceType: 'hybrid', salaryText: '$50 to $70 hourly' });
    expect(result.jobs[0].salaryMin).toBeUndefined();
    expect(result.jobs[0].description).toContain('Visa support');
    expect(result.jobs[0].description).toContain('Closing');
  });
});
