'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search, ExternalLink, Briefcase } from 'lucide-react';
import { MOCK_COMPANIES } from '@/lib/mock-data';
import type { Metadata } from 'next';

const ALL_SIZES = ['50-200','200-500','500-1000','1000+'];

export default function CompaniesPage() {
  const [q, setQ]         = useState('');
  const [size, setSize]   = useState('');

  const filtered = MOCK_COMPANIES.filter(c => {
    const matchQ    = !q || c.name.toLowerCase().includes(q.toLowerCase());
    const matchSize = !size || c.size === size;
    return matchQ && matchSize;
  });

  return (
    <div className="max-w-[1240px] mx-auto px-5 py-10">
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight mb-2">
          Companies Hiring Remotely
        </h1>
        <p className="text-stone-400 dark:text-stone-500">
          {MOCK_COMPANIES.length} companies actively posting remote jobs
        </p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-xl focus-within:border-brand-600 transition-colors">
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search companies…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
          />
        </div>
        <select value={size} onChange={e => setSize(e.target.value)}
          className="input text-sm sm:w-44">
          <option value="">All sizes</option>
          {ALL_SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
        </select>
      </div>

      {/* Featured companies */}
      {!q && !size && (
        <div className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
            Featured Companies
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {MOCK_COMPANIES.filter(c => c.featured).map(company => (
              <Link key={company.id} href={`/jobs?q=${encodeURIComponent(company.name)}`}
                className="card p-5 flex flex-col items-center text-center hover:border-brand-600 dark:hover:border-brand-500 hover:-translate-y-0.5 transition-all group">
                <div className="w-14 h-14 rounded-2xl bg-stone-100 dark:bg-[#162033] flex items-center justify-center text-2xl font-black text-brand-700 dark:text-brand-400 mb-3">
                  {company.logo ?? company.name[0]}
                </div>
                <p className="font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
                  {company.name}
                </p>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                  {company.jobCount} jobs
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* All companies */}
      <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
        {q || size ? `${filtered.length} companies` : 'All Companies'}
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
                  <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                    {company.country} · {company.size} employees
                  </p>
                  {company.description && (
                    <p className="text-xs text-stone-400 dark:text-stone-500 mt-1.5 leading-relaxed line-clamp-2">
                      {company.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {company.categories.slice(0, 3).map(cat => (
                  <span key={cat} className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 text-[10px] font-semibold uppercase tracking-wider">
                    {cat}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-stone-100 dark:border-[#1e3a5f]">
                <Link href={`/jobs?q=${encodeURIComponent(company.name)}`}
                  className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-400 hover:underline">
                  <Briefcase className="w-3.5 h-3.5" />
                  {company.jobCount} open roles
                </Link>
                {company.website && (
                  <a href={company.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Website
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
