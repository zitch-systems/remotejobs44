'use client';
// components/jobs/JobsFiltersBar.tsx
//
// All the filter UI for the /jobs listing page extracted into a single
// client island. The rest of the listing (results header, grid of cards,
// JSON-LD ItemList, pagination) is now server-rendered so AI/non-JS
// crawlers see the actual jobs on the page.
//
// State lives in the URL — each control updates the querystring via
// router.push, which re-runs the server component's data fetch.
import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, SlidersHorizontal, X, MapPin, Banknote, Briefcase, TrendingUp,
  Clock, Globe2, Timer, Flag, Code2, Palette, BarChart2,
  DollarSign, Handshake, Database, Users, Package, Scale, Settings2, Sparkles,
} from 'lucide-react';
import { cn, CATEGORY_META } from '@/lib/utils';
import type { JobCategory, JobType, JobLevel } from '@/lib/types';

const CATEGORIES: (JobCategory | 'all')[] = ['all','engineering','design','marketing','finance','sales','data','hr','product','legal','operations','other'];
const CAT_ICONS: Record<string, React.ReactNode> = {
  all:         <Globe2     className="w-3.5 h-3.5 shrink-0" />,
  engineering: <Code2      className="w-3.5 h-3.5 shrink-0" />,
  design:      <Palette    className="w-3.5 h-3.5 shrink-0" />,
  marketing:   <TrendingUp className="w-3.5 h-3.5 shrink-0" />,
  finance:     <DollarSign className="w-3.5 h-3.5 shrink-0" />,
  sales:       <Handshake  className="w-3.5 h-3.5 shrink-0" />,
  data:        <Database   className="w-3.5 h-3.5 shrink-0" />,
  hr:          <Users      className="w-3.5 h-3.5 shrink-0" />,
  product:     <Package    className="w-3.5 h-3.5 shrink-0" />,
  legal:       <Scale      className="w-3.5 h-3.5 shrink-0" />,
  operations:  <Settings2  className="w-3.5 h-3.5 shrink-0" />,
  other:       <Sparkles   className="w-3.5 h-3.5 shrink-0" />,
};
const TYPES: { value: JobType|''; label: string }[] = [
  { value:'',           label:'Any type'  },
  { value:'full-time',  label:'Full-time' },
  { value:'part-time',  label:'Part-time' },
  { value:'contract',   label:'Contract'  },
  { value:'freelance',  label:'Freelance' },
];
const LEVELS: { value: JobLevel|''; label: string }[] = [
  { value:'',          label:'Any level'     },
  { value:'entry',     label:'Entry level'   },
  { value:'mid',       label:'Mid level'     },
  { value:'senior',    label:'Senior'        },
  { value:'lead',      label:'Lead / Staff'  },
  { value:'executive', label:'Executive / VP'},
];
// Flip to true once enough jobs in the DB publish salary info (currently ~0%).
const SALARY_FILTER_ENABLED = false;
const SALARY_RANGES = [
  { value:'',        label:'Any salary'    },
  { value:'0-30',    label:'Under $30k'   },
  { value:'30-60',   label:'$30k – $60k'  },
  { value:'60-100',  label:'$60k – $100k' },
  { value:'100-150', label:'$100k – $150k'},
  { value:'150-999', label:'$150k+'       },
];
const TIMEZONES = [
  { value:'',    label:'Any timezone'      },
  { value:'WAT', label:'West Africa (WAT)' },
  { value:'GMT', label:'GMT / UTC'         },
  { value:'EST', label:'US Eastern (EST)'  },
  { value:'PST', label:'US Pacific (PST)'  },
  { value:'CET', label:'Europe (CET)'      },
  { value:'IST', label:'India (IST)'       },
  { value:'Any', label:'Timezone flexible' },
];
const POSTED_WITHIN = [
  { value:'',   label:'Any time'      },
  { value:'1',  label:'Last 24 hours' },
  { value:'7',  label:'Last 7 days'   },
  { value:'14', label:'Last 14 days'  },
  { value:'30', label:'Last 30 days'  },
];
const SORTS = [
  { value:'newest',   label:'Newest first'   },
  { value:'salary',   label:'Highest salary' },
  { value:'relevant', label:'Most relevant'  },
];
const REGIONS = [
  { value:'',             label:'Any region'         },
  { value:'africa',       label:'🌍 Africa'           },
  { value:'nigeria',      label:'🇳🇬 Nigeria'          },
  { value:'ghana',        label:'🇬🇭 Ghana'            },
  { value:'kenya',        label:'🇰🇪 Kenya'            },
  { value:'south-africa', label:'🇿🇦 South Africa'     },
  { value:'europe',       label:'🌍 Europe'           },
  { value:'uk',           label:'🇬🇧 United Kingdom'   },
  { value:'us',           label:'🇺🇸 United States'    },
  { value:'canada',       label:'🇨🇦 Canada'           },
  { value:'latam',        label:'🌎 Latin America'     },
  { value:'asia',         label:'🌏 Asia'             },
  { value:'worldwide',    label:'🌐 Worldwide / Global'},
];
const COUNTRIES: { value: string; label: string; group: string }[] = [
  { value: 'nigeria',      label: '🇳🇬 Nigeria',             group: 'Africa'       },
  { value: 'ghana',        label: '🇬🇭 Ghana',               group: 'Africa'       },
  { value: 'kenya',        label: '🇰🇪 Kenya',               group: 'Africa'       },
  { value: 'south-africa', label: '🇿🇦 South Africa',        group: 'Africa'       },
  { value: 'egypt',        label: '🇪🇬 Egypt',               group: 'Africa'       },
  { value: 'ethiopia',     label: '🇪🇹 Ethiopia',            group: 'Africa'       },
  { value: 'tanzania',     label: '🇹🇿 Tanzania',            group: 'Africa'       },
  { value: 'rwanda',       label: '🇷🇼 Rwanda',              group: 'Africa'       },
  { value: 'senegal',      label: '🇸🇳 Senegal',             group: 'Africa'       },
  { value: 'cameroon',     label: '🇨🇲 Cameroon',            group: 'Africa'       },
  { value: 'us',           label: '🇺🇸 United States',       group: 'Americas'     },
  { value: 'canada',       label: '🇨🇦 Canada',              group: 'Americas'     },
  { value: 'brazil',       label: '🇧🇷 Brazil',              group: 'Americas'     },
  { value: 'mexico',       label: '🇲🇽 Mexico',              group: 'Americas'     },
  { value: 'colombia',     label: '🇨🇴 Colombia',            group: 'Americas'     },
  { value: 'argentina',    label: '🇦🇷 Argentina',           group: 'Americas'     },
  { value: 'uk',           label: '🇬🇧 United Kingdom',      group: 'Europe'       },
  { value: 'germany',      label: '🇩🇪 Germany',             group: 'Europe'       },
  { value: 'france',       label: '🇫🇷 France',              group: 'Europe'       },
  { value: 'netherlands',  label: '🇳🇱 Netherlands',         group: 'Europe'       },
  { value: 'spain',        label: '🇪🇸 Spain',               group: 'Europe'       },
  { value: 'sweden',       label: '🇸🇪 Sweden',              group: 'Europe'       },
  { value: 'poland',       label: '🇵🇱 Poland',              group: 'Europe'       },
  { value: 'portugal',     label: '🇵🇹 Portugal',            group: 'Europe'       },
  { value: 'india',        label: '🇮🇳 India',               group: 'Asia-Pacific' },
  { value: 'singapore',    label: '🇸🇬 Singapore',           group: 'Asia-Pacific' },
  { value: 'australia',    label: '🇦🇺 Australia',           group: 'Asia-Pacific' },
  { value: 'indonesia',    label: '🇮🇩 Indonesia',           group: 'Asia-Pacific' },
  { value: 'philippines',  label: '🇵🇭 Philippines',         group: 'Asia-Pacific' },
  { value: 'uae',          label: '🇦🇪 UAE',                 group: 'Middle East'  },
  { value: 'worldwide',    label: '🌐 Worldwide / Global',   group: 'Global'       },
];
const COUNTRY_GROUPS = Array.from(new Set(COUNTRIES.map(c => c.group)));

const CHEVRON_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;
const PILL_SELECT_CLASS =
  'text-xs font-semibold border border-stone-200 dark:border-[#1e3a5f] rounded-full px-3 py-1.5 bg-white dark:bg-[#0a1628] text-stone-600 dark:text-stone-300 focus:outline-none focus:border-brand-500 cursor-pointer appearance-none pr-7';
const PILL_BG_STYLE: React.CSSProperties = {
  backgroundImage: CHEVRON_SVG,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
  backgroundSize: '12px',
};

function FilterSelect({ label, value, onChange, options, icon }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">
        {icon}{label}
      </label>
      <select
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 text-sm rounded-lg border border-stone-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0a1628] text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-600 transition-all"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string | undefined; onRemove: () => void }) {
  if (!label) return null;
  return (
    <span className="flex items-center gap-1 px-2.5 py-1 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 text-xs font-semibold rounded-full border border-brand-200 dark:border-brand-800">
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:text-brand-900 dark:hover:text-brand-200">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function CountrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">
        <MapPin className="w-3 h-3" />Country
      </label>
      <select
        aria-label="Country"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 text-sm rounded-lg border border-stone-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0a1628] text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-600 transition-all"
      >
        <option value="">Any country</option>
        {COUNTRY_GROUPS.map(group => (
          <optgroup key={group} label={group}>
            {COUNTRIES.filter(c => c.group === group).map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export function JobsFiltersBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  // useTransition surfaces the in-flight SSR navigation so the search
  // input can spin and the Search button can show "Searching…" while
  // the new /jobs?q=... route is rendered. Without this the user sees
  // nothing happen for ~2-8s on cold queries and thinks Enter died.
  const [isPending, startTransition] = useTransition();

  const q           = searchParams.get('q')           ?? '';
  const category    = (searchParams.get('category')   ?? 'all') as JobCategory | 'all';
  const type        = searchParams.get('type')        ?? '';
  const level       = searchParams.get('level')       ?? '';
  const salary      = searchParams.get('salary')      ?? '';
  const timezone    = searchParams.get('timezone')    ?? '';
  const posted      = searchParams.get('posted')      ?? '';
  const remoteOnly  = (searchParams.get('remote') ?? 'true') !== 'false';
  const region      = searchParams.get('region')      ?? '';
  const country     = searchParams.get('country')     ?? '';
  const sort        = searchParams.get('sort')        ?? 'newest';

  const activeFilterCount = [type, level, salary, timezone, posted, region, country].filter(Boolean).length;
  const hasActiveChips = category !== 'all' || type || level || country || posted;

  // "Most relevant" only ranks when there's a search term — relevance lives
  // in the search_jobs FTS path, so with no `q` it silently fell back to
  // newest-first. Only offer it while searching, and never let the <select>
  // display an option the backend will ignore.
  const sortOptions = q ? SORTS : SORTS.filter(s => s.value !== 'relevant');
  const effectiveSort = sortOptions.some(s => s.value === sort) ? sort : 'newest';

  useEffect(() => { setSearchInput(q); }, [q]);

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') p.set(key, value); else p.delete(key);
    p.delete('page');
    startTransition(() => { router.push(`/jobs?${p.toString()}`); });
  }
  function handleSearch() {
    const p = new URLSearchParams(searchParams.toString());
    if (searchInput.trim()) p.set('q', searchInput.trim()); else p.delete('q');
    p.delete('page');
    startTransition(() => { router.push(`/jobs?${p.toString()}`); });
  }
  function clearAll() {
    setSearchInput('');
    startTransition(() => { router.push('/jobs'); });
  }

  return (
    <div className="mb-4">
      {/* Search row */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl focus-within:border-brand-600 dark:focus-within:border-brand-500 focus-within:shadow-glow transition-all shadow-sm">
          {isPending ? (
            <span className="w-4 h-4 border-2 border-stone-300 dark:border-stone-600 border-t-brand-600 rounded-full animate-spin shrink-0" aria-label="Searching" />
          ) : (
            <Search className="w-4 h-4 text-stone-400 shrink-0" />
          )}
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => {
              // Skip Enter while an IME composition session is in progress
              // (CJK input methods use Enter to confirm candidate text and
              // we shouldn't treat that as "submit search"). e.preventDefault
              // is required so the implicit form-submit some browsers fire on
              // Enter inside an <input> doesn't reload the page.
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Job title, skill, or company…"
            className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 disabled:opacity-60"
            disabled={isPending}
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setParam('q', ''); }} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <select aria-label="Sort jobs" value={effectiveSort} onChange={e => setParam('sort', e.target.value)}
            className="input text-sm py-3 pl-3 pr-8 rounded-xl w-auto min-w-[140px]">
            {sortOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn('flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all shadow-sm',
              showFilters || activeFilterCount > 0
                ? 'bg-brand-700 dark:bg-brand-600 text-white border-brand-700 dark:border-brand-600'
                : 'bg-white dark:bg-[#0a1628] border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 hover:border-brand-600 dark:hover:border-brand-500')}>
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          {searchInput && (
            <button onClick={handleSearch} disabled={isPending}
              className="px-5 py-2.5 bg-brand-700 dark:bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-800 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed">
              {isPending ? 'Searching…' : 'Search'}
            </button>
          )}
        </div>
      </div>

      {/* Quick filter pill row */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {/* Remote-only toggle — first slot, ON by default. */}
        <button
          onClick={() => setParam('remote', remoteOnly ? 'false' : 'true')}
          aria-pressed={remoteOnly}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all shadow-sm',
            remoteOnly
              ? 'bg-brand-700 dark:bg-brand-600 text-white border-brand-700 dark:border-brand-600 hover:bg-brand-800'
              : 'bg-white dark:bg-[#0a1628] text-stone-600 dark:text-stone-300 border-stone-200 dark:border-[#1e3a5f] hover:border-brand-600 dark:hover:border-brand-500'
          )}
          title={remoteOnly ? 'Showing remote-only roles — click to include on-site jobs' : 'Click to filter to remote-only roles'}
        >
          <Globe2 className="w-3.5 h-3.5" />
          {remoteOnly ? 'Remote only · ON' : 'Remote only · OFF'}
          {remoteOnly && (
            <span className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white/25">
              <X className="w-2.5 h-2.5" />
            </span>
          )}
        </button>

        <div className="relative">
          <select aria-label="Filter by job type" value={type} onChange={e => setParam('type', e.target.value)}
            className={PILL_SELECT_CLASS} style={PILL_BG_STYLE}>
            {TYPES.map(o => <option key={o.value} value={o.value}>{o.value === '' ? 'Job Type' : o.label}</option>)}
          </select>
        </div>

        <div className="relative">
          <select aria-label="Filter by experience level" value={level} onChange={e => setParam('level', e.target.value)}
            className={PILL_SELECT_CLASS} style={PILL_BG_STYLE}>
            {LEVELS.map(o => <option key={o.value} value={o.value}>{o.value === '' ? 'Level' : o.label}</option>)}
          </select>
        </div>

        <div className="relative">
          <select aria-label="Filter by date posted" value={posted} onChange={e => setParam('posted', e.target.value)}
            className={PILL_SELECT_CLASS} style={PILL_BG_STYLE}>
            {POSTED_WITHIN.map(o => <option key={o.value} value={o.value}>{o.value === '' ? 'Posted Within' : o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Active filter chips */}
      {hasActiveChips && (
        <div className="flex gap-2 flex-wrap mt-2">
          {category !== 'all' && (
            <FilterChip
              label={CATEGORY_META[category as keyof typeof CATEGORY_META]?.label}
              onRemove={() => setParam('category', 'all')}
            />
          )}
          {type    && <FilterChip label={TYPES.find(t => t.value === type)?.label}     onRemove={() => setParam('type',    '')} />}
          {level   && <FilterChip label={LEVELS.find(l => l.value === level)?.label}   onRemove={() => setParam('level',   '')} />}
          {country && <FilterChip label={COUNTRIES.find(c => c.value === country)?.label?.replace(/^\S+\s/, '')} onRemove={() => setParam('country', '')} />}
          {posted  && <FilterChip label={POSTED_WITHIN.find(p => p.value === posted)?.label} onRemove={() => setParam('posted', '')} />}
          {remoteOnly && <FilterChip label="Remote only" onRemove={() => setParam('remote', 'false')} />}
        </div>
      )}

      {/* Advanced filters panel */}
      {showFilters && (
        <div className="mt-3 p-5 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl shadow-sm">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="col-span-2 sm:col-span-2 lg:col-span-2">
              <CountrySelect value={country} onChange={v => setParam('country', v)} />
            </div>
            <FilterSelect label="Region"       value={region}      onChange={v => setParam('region', v)}      options={REGIONS}       icon={<Flag className="w-3 h-3" />}        />
            <FilterSelect label="Job Type"     value={type}        onChange={v => setParam('type', v)}        options={TYPES}         icon={<Briefcase className="w-3 h-3" />}    />
            <FilterSelect label="Level"        value={level}       onChange={v => setParam('level', v)}       options={LEVELS}        icon={<TrendingUp className="w-3 h-3" />}   />
            {SALARY_FILTER_ENABLED && (
              <FilterSelect label="Salary"     value={salary}      onChange={v => setParam('salary', v)}      options={SALARY_RANGES} icon={<Banknote className="w-3 h-3" />}     />
            )}
            <FilterSelect label="Timezone"     value={timezone}    onChange={v => setParam('timezone', v)}    options={TIMEZONES}     icon={<Timer className="w-3 h-3" />}        />
            <FilterSelect label="Posted"       value={posted}      onChange={v => setParam('posted', v)}      options={POSTED_WITHIN} icon={<Clock className="w-3 h-3" />}        />
            <div className="flex items-end">
              {activeFilterCount > 0 && (
                <button onClick={clearAll}
                  className="w-full py-2.5 text-xs font-semibold text-red-500 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mt-5">
        {CATEGORIES.map(cat => {
          const m = CATEGORY_META[cat as keyof typeof CATEGORY_META];
          return (
            <button key={cat} onClick={() => setParam('category', cat)}
              className={cn('chip shrink-0 text-xs transition-all flex items-center gap-1.5',
                category === cat && 'active scale-[1.02]')}>
              {CAT_ICONS[cat]}
              {m?.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Helper for the server component to expose Clear-all without a separate
// client roundtrip.
export function ClearAllButton() {
  const router = useRouter();
  return (
    <button onClick={() => router.push('/jobs')}
      className="text-xs text-stone-400 hover:text-red-500 transition-colors flex items-center gap-1">
      <X className="w-3.5 h-3.5" /> Clear all
    </button>
  );
}

// Remote-only inline toggle for the results header.
export function RemoteToggleLink() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const remoteOnly = (searchParams.get('remote') ?? 'true') !== 'false';
  function toggle() {
    const p = new URLSearchParams(searchParams.toString());
    if (remoteOnly) p.set('remote', 'false'); else p.delete('remote');
    p.delete('page');
    router.push(`/jobs?${p.toString()}`);
  }
  return (
    <button onClick={toggle}
      className="ml-2 text-xs text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 underline transition-colors">
      {remoteOnly ? 'Show on-site jobs too →' : 'Remote only →'}
    </button>
  );
}
