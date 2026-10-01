import http from 'node:http';

const port = Number(process.env.SUPABASE_FIXTURE_PORT ?? 4800);
const now = new Date().toISOString();
const job = {
  id: '12345678-1234-4234-8234-123456789abc',
  title: 'Senior Software Engineer',
  company: 'Fixture Employer',
  company_id: null,
  logo: null,
  category: 'engineering',
  type: 'full-time',
  level: 'senior',
  location: 'Worldwide',
  timezone: 'UTC',
  description: 'Build reliable software for a distributed team.',
  requirements: ['TypeScript'],
  skills: ['React'],
  benefits: ['Flexible hours'],
  salary_min: 100000,
  salary_max: 140000,
  salary_text: '$100,000–$140,000',
  currency: 'USD',
  workplace_type: 'remote',
  relocation_supported: false,
  visa_sponsorship: false,
  remote: true,
  featured: false,
  is_new: true,
  is_active: true,
  source: 'manual',
  source_url: null,
  views: 0,
  applications: 0,
  posted_at: now,
  expires_at: null,
  created_at: now,
  flagged: false,
  flagged_reason: null,
};

function json(res, status, value, count = false) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...(count ? { 'content-range': '0-0/1', 'range-unit': 'items' } : {}),
  });
  res.end(JSON.stringify(value));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);

  // The fixture is deliberately read-only. Supabase RPCs use POST even for
  // pure SELECT functions, so only the search/count functions needed by the
  // public jobs endpoint are allowlisted below.
  if (req.method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
    const rpc = url.pathname.slice('/rest/v1/rpc/'.length);
    if (rpc === 'search_jobs' || rpc === 'search_jobs_trgm') return json(res, 200, [job]);
    if (rpc === 'search_jobs_count' || rpc === 'search_jobs_trgm_count') return json(res, 200, 1);
    return json(res, 405, { message: 'Fixture RPC is not allowlisted' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { message: 'Read-only fixture' });
  }

  if (url.pathname === '/rest/v1/jobs') {
    const wantsObject = String(req.headers.accept ?? '').includes('vnd.pgrst.object');
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-range': '0-0/1',
      'range-unit': 'items',
    });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(wantsObject ? job : [job]));
  }

  // Anonymous auth/session checks and unrelated safe reads resolve empty.
  return json(res, 200, []);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`read-only Supabase fixture listening on ${port}\n`);
});
