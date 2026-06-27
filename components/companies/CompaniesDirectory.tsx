'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search, Briefcase } from 'lucide-react';
import { companySlug } from '@/lib/company-slug';

export interface Company {
  name: string;
  logo?: string;
  jobCount: number;
  categories: string[];
  featured?: boolean;
}

// Client island for the companies directory. The full list is passed in from
// the Server Component (already rendered into the initial HTML for SEO), so
// this only owns the client-side search filter — no data fetching, no
// loading skeleton, no empty-on-first-paint flash.
export function CompaniesDirectory({ companies }: { companies: Company[] }) {
  const [q, setQ] = useState('');

  const filtered = companies.filter(c =>
    !q || c.name.toLowerCase().includes(q.toLowerCase())
  );
  const featured = filtered.filter(c => c.featured).slice(0, 8);

  return (
    <>
      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-xl focus-within:border-brand-600 transition-colors">
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search companies…"
            aria-label="Search companies"
            className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
          />
        </div>
      </div>

      {/* Featured companies — only shown when not searching */}
      {!q && featured.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
            Featured Companies
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {featured.map(company => (
              <Link key={company.name} href={`/companies/${companySlug(company.name)}`}
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
          {filtered.map(company => {
            const slug = companySlug(company.name);
            return (
              <Link key={company.name} href={`/companies/${slug}`}
                className="card p-5 hover:border-brand-600 dark:hover:border-brand-500 transition-colors group block">
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
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-400">
                    <Briefcase className="w-3.5 h-3.5" />
                    {company.jobCount} open {company.jobCount === 1 ? 'role' : 'roles'}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
