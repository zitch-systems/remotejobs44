'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, ExternalLink, Briefcase } from 'lucide-react';

interface Company {
  id: string;
  name: string;
  logo?: string;
  jobCount: number;
  categories: string[];
  featured?: boolean;
}

export default function CompaniesPage() {
  const [q, setQ]                   = useState('');
  const [companies, setCompanies]   = useState<Company[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch all active jobs and derive companies from them. Pass
        // remote=false explicitly so companies that only post on-site
        // (e.g. Adyen, some UK firms) still appear in the directory —
        // /api/jobs defaults to remote-only otherwise.
        const res = await fetch('/api/jobs?perPage=200&sort=newest&remote=false');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        const jobs: any[] = data.jobs ?? [];

        // Aggregate by company name
        const map = new Map<string, Company>();
        for (const job of jobs) {
          const key = (job.company ?? '').trim();
          if (!key) continue;
          if (!map.has(key)) {
            map.set(key, {
              id:         key,
              name:       key,
              logo:       job.logo ?? key[0],
              jobCount:   0,
              categories: [],
              featured:   job.featured ?? false,
            });
          }
          const entry = map.get(key)!;
          entry.jobCount++;
          if (job.category && !entry.categories.includes(job.category)) {
            entry.categories.push(job.category);
          }
          if (job.featured) entry.featured = true;
        }

        const list = Array.from(map.values()).sort((a, b) => b.jobCount - a.jobCount);
        setCompanies(list);
      } catch {
        setCompanies([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = companies.filter(c =>
    !q || c.name.toLowerCase().includes(q.toLowerCase())
  );

  const featured = filtered.filter(c => c.featured).slice(0, 8);

  return (
    <div className="max-w-[1440px] mx-auto px-5 py-10">
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-2">
          Companies Hiring Remotely
        </h1>
        <p className="text-stone-400 dark:text-stone-500">
          {loading ? 'Loading companies…' : `${companies.length} companies actively posting remote jobs`}
        </p>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-xl focus-within:border-brand-600 transition-colors">
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search companies…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="skeleton w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Featured companies — only shown when not searching */}
          {!q && featured.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
                Featured Companies
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {featured.map(company => (
                  <Link key={company.id} href={`/jobs?q=${encodeURIComponent(company.name)}`}
                    className="card p-5 flex flex-col items-center text-center hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 transition-all group">
                    <div className="w-14 h-14 rounded-2xl bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-2xl font-black text-brand-700 dark:text-brand-400 mb-3">
                      {company.logo ?? company.name[0]}
                    </div>
                    <p className="font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
                      {company.name}
                    </p>
                    <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                      {company.jobCount} {company.jobCount === 1 ? 'job' : 'jobs'}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* All companies */}
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
            {q ? `${filtered.length} companies` : 'All Companies'}
          </h2>

          {filtered.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-stone-400 dark:text-stone-500">No companies found. Try a different search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(company => (
                <div key={company.id} className="card p-5 hover:border-brand-600 dark:hover:border-brand-500 transition-colors group">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-xl font-black text-brand-700 dark:text-brand-400 shrink-0">
                      {company.logo ?? company.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
                        {company.name}
                      </p>
                      {company.categories.length > 0 && (
                        <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 capitalize">
                          {company.categories.slice(0, 2).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {company.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {company.categories.slice(0, 3).map(cat => (
                        <span key={cat} className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 text-[10px] font-semibold uppercase tracking-wider">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-stone-100 dark:border-[#1e3a5f]">
                    <Link href={`/jobs?q=${encodeURIComponent(company.name)}`}
                      className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-400 hover:underline">
                      <Briefcase className="w-3.5 h-3.5" />
                      {company.jobCount} open {company.jobCount === 1 ? 'role' : 'roles'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
