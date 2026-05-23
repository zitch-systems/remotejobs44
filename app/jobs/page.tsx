'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight, MapPin, Banknote, Briefcase, TrendingUp, Clock, Zap, LayoutGrid, List, Globe2, Building2, Timer, Flag, Code2, Palette, BarChart2, DollarSign, Handshake, Database, Users, Package, Scale, Settings2, Sparkles } from 'lucide-react';
import { jobsApi } from '@/lib/api';
import { JobCard } from '@/components/jobs/JobCard';
import { cn, CATEGORY_META } from '@/lib/utils';
import { MOCK_JOBS } from '@/lib/mock-data';
import type { Job, JobCategory, JobType, JobLevel } from '@/lib/types';

const CATEGORIES: (JobCategory | 'all')[] = ['all','engineering','design','marketing','finance','sales','data','hr','product','legal','operations','other'];

// Lucide SVG icons for category chips — crisp at all resolutions
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
const COMPANY_SIZES = [
  { value:'',       label:'Any size'          },
  { value:'startup',label:'Startup (1–50)'    },
  { value:'mid',    label:'Mid-size (51–500)' },
  { value:'large',  label:'Large (500+)'      },
];
const REMOTE_OPTIONS = [
  { value:'',     label:'All jobs'    },
  { value:'true', label:'Remote only' },
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

// Grouped countries list
const COUNTRIES: { value: string; label: string; group: string }[] = [
  // Africa
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
  // Americas
  { value: 'us',           label: '🇺🇸 United States',       group: 'Americas'     },
  { value: 'canada',       label: '🇨🇦 Canada',              group: 'Americas'     },
  { value: 'brazil',       label: '🇧🇷 Brazil',              group: 'Americas'     },
  { value: 'mexico',       label: '🇲🇽 Mexico',              group: 'Americas'     },
  { value: 'colombia',     label: '🇨🇴 Colombia',            group: 'Americas'     },
  { value: 'argentina',    label: '🇦🇷 Argentina',           group: 'Americas'     },
  // Europe
  { value: 'uk',           label: '🇬🇧 United Kingdom',      group: 'Europe'       },
  { value: 'germany',      label: '🇩🇪 Germany',             group: 'Europe'       },
  { value: 'france',       label: '🇫🇷 France',              group: 'Europe'       },
  { value: 'netherlands',  label: '🇳🇱 Netherlands',         group: 'Europe'       },
  { value: 'spain',        label: '🇪🇸 Spain',               group: 'Europe'       },
  { value: 'sweden',       label: '🇸🇪 Sweden',              group: 'Europe'       },
  { value: 'poland',       label: '🇵🇱 Poland',              group: 'Europe'       },
  { value: 'portugal',     label: '🇵🇹 Portugal',            group: 'Europe'       },
  // Asia-Pacific
  { value: 'india',        label: '🇮🇳 India',               group: 'Asia-Pacific' },
  { value: 'singapore',    label: '🇸🇬 Singapore',           group: 'Asia-Pacific' },
  { value: 'australia',    label: '🇦🇺 Australia',           group: 'Asia-Pacific' },
  { value: 'indonesia',    label: '🇮🇩 Indonesia',           group: 'Asia-Pacific' },
  { value: 'philippines',  label: '🇵🇭 Philippines',         group: 'Asia-Pacific' },
  // Middle East
  { value: 'uae',          label: '🇦🇪 UAE',                 group: 'Middle East'  },
  // Global
  { value: 'worldwide',    label: '🌐 Worldwide / Global',   group: 'Global'       },
];

// Unique groups in order
const COUNTRY_GROUPS = Array.from(new Set(COUNTRIES.map(c => c.group)));

// Dropdown chevron SVG as inline data URI
const CHEVRON_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

const PILL_SELECT_CLASS =
  'text-xs font-semibold border border-stone-200 dark:border-[#1e3a5f] rounded-full px-3 py-1.5 bg-white dark:bg-[#0a1628] text-stone-600 dark:text-stone-300 focus:outline-none focus:border-brand-500 cursor-pointer appearance-none pr-7';

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl p-5 animate-pulse">
      <div className="flex items-start gap-3 mb-4">
        <div className="skeleton w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1"><div className="skeleton h-4 w-3/4 rounded mb-2" /><div className="skeleton h-3 w-1/2 rounded" /></div>
      </div>
      <div className="flex gap-2 mb-3"><div className="skeleton h-5 w-16 rounded-full" /><div className="skeleton h-5 w-20 rounded-full" /></div>
      <div className="skeleton h-3 w-full rounded mb-1" /><div className="skeleton h-3 w-2/3 rounded mb-4" />
      <div className="flex justify-between pt-3 border-t border-stone-100 dark:border-[#1e3a5f]">
        <div className="skeleton h-4 w-24 rounded" /><div className="skeleton h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

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

function JobsContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [jobs,        setJobs]        = useState<Job[]>([]);
  const [total,       setTotal]       = useState(0);
  const [pages,       setPages]       = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [viewMode,    setViewMode]    = useState<'grid' | 'list'>('grid');

  const q           = searchParams.get('q')          ?? '';
  const category    = (searchParams.get('category')  ?? 'all') as JobCategory | 'all';
  const type        = searchParams.get('type')        ?? '';
  const level       = searchParams.get('level')       ?? '';
  const salary      = searchParams.get('salary')      ?? '';
  const timezone    = searchParams.get('timezone')    ?? '';
  const posted      = searchParams.get('posted')      ?? '';
  const remoteOnly  = searchParams.get('remote')      ?? '';
  const companySize = searchParams.get('companySize') ?? '';
  const region      = searchParams.get('region')      ?? '';
  const country     = searchParams.get('country')     ?? '';
  const sort        = searchParams.get('sort')        ?? 'newest';
  const page        = parseInt(searchParams.get('page') ?? '1');

  const activeFilterCount = [type, level, salary, timezone, posted, remoteOnly, companySize, region, country].filter(Boolean).length;

  useEffect(() => { setSearchInput(q); }, [q]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jobsApi.getJobs({ q, category, type: type as JobType, level: level as JobLevel, sort: sort as 'newest' | 'salary' | 'relevant', page, perPage: 12, region });
      if (res.jobs.length > 0) {
        setJobs(res.jobs);
        setTotal(res.total);
        setPages(res.pages);
      } else {
        let mocks = [...MOCK_JOBS];
        if (q) {
          const lq = q.toLowerCase();
          mocks = mocks.filter(j => j.title.toLowerCase().includes(lq) || j.company.toLowerCase().includes(lq));
        }
        if (category && category !== 'all') mocks = mocks.filter(j => j.category === category);
        if (type)  mocks = mocks.filter(j => j.type  === type);
        if (level) mocks = mocks.filter(j => j.level === level);

        // Resolve filter term — country takes priority over region
        const locationFilter = country || region;
        if (locationFilter) {
          const regionMap: Record<string, string[]> = {
            africa:       ['africa','nigeria','ghana','kenya','south africa','egypt','ethiopia'],
            nigeria:      ['nigeria','lagos','abuja'],
            ghana:        ['ghana','accra'],
            kenya:        ['kenya','nairobi'],
            'south-africa':['south africa','johannesburg','cape town'],
            europe:       ['europe','uk','germany','france','netherlands','spain','italy','sweden'],
            uk:           ['uk','united kingdom','london','england'],
            us:           ['us','usa','united states','new york','san francisco','los angeles'],
            canada:       ['canada','toronto','vancouver'],
            latam:        ['latin america','brazil','mexico','colombia','argentina'],
            asia:         ['asia','india','singapore','japan','china','korea'],
            worldwide:    ['worldwide','global','remote'],
            egypt:        ['egypt','cairo'],
            ethiopia:     ['ethiopia','addis ababa'],
            tanzania:     ['tanzania','dar es salaam'],
            rwanda:       ['rwanda','kigali'],
            senegal:      ['senegal','dakar'],
            cameroon:     ['cameroon','douala','yaounde'],
            brazil:       ['brazil','são paulo','rio'],
            mexico:       ['mexico','mexico city'],
            colombia:     ['colombia','bogota','medellin'],
            argentina:    ['argentina','buenos aires'],
            germany:      ['germany','berlin','munich'],
            france:       ['france','paris'],
            netherlands:  ['netherlands','amsterdam'],
            spain:        ['spain','madrid','barcelona'],
            sweden:       ['sweden','stockholm'],
            poland:       ['poland','warsaw'],
            portugal:     ['portugal','lisbon'],
            india:        ['india','bangalore','mumbai','delhi'],
            singapore:    ['singapore'],
            australia:    ['australia','sydney','melbourne'],
            indonesia:    ['indonesia','jakarta'],
            philippines:  ['philippines','manila'],
            uae:          ['uae','dubai','abu dhabi'],
          };
          const terms = regionMap[locationFilter] ?? [locationFilter];
          mocks = mocks.filter(j => terms.some(t => j.location.toLowerCase().includes(t)));
        }
        const perPage = 12;
        const totalCount = mocks.length;
        const start = (page - 1) * perPage;
        setJobs(mocks.slice(start, start + perPage));
        setTotal(totalCount);
        setPages(Math.ceil(totalCount / perPage));
      }
    } finally {
      setLoading(false);
    }
  }, [q, category, type, level, salary, timezone, posted, remoteOnly, companySize, region, country, sort, page]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') p.set(key, value); else p.delete(key);
    p.delete('page');
    router.push(`/jobs?${p.toString()}`);
  }
  function setPage(n: number) {
    const p = new URLSearchParams(searchParams.toString());
    p.set('page', String(n));
    router.push(`/jobs?${p.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function handleSearch() {
    const p = new URLSearchParams(searchParams.toString());
    if (searchInput.trim()) p.set('q', searchInput.trim()); else p.delete('q');
    p.delete('page');
    router.push(`/jobs?${p.toString()}`);
  }
  function clearAll() {
    setSearchInput('');
    router.push('/jobs');
  }

  const catMeta = CATEGORY_META[category as keyof typeof CATEGORY_META] ?? CATEGORY_META['all'];
  const hasActive = q || category !== 'all' || activeFilterCount > 0;
  const hasActiveChips = category !== 'all' || type || level || country || posted || remoteOnly;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-5 py-6">

      {/* Search row */}
      <div className="mb-4">
        <div className="flex gap-2 flex-col sm:flex-row">
          <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl focus-within:border-brand-600 dark:focus-within:border-brand-500 focus-within:shadow-glow transition-all shadow-sm">
            <Search className="w-4 h-4 text-stone-400 shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Job title, skill, or company…"
              className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setParam('q', ''); }} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <select value={sort} onChange={e => setParam('sort', e.target.value)}
              className="input text-sm py-3 pl-3 pr-8 rounded-xl w-auto min-w-[140px]">
              {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
              <button onClick={handleSearch}
                className="px-5 py-2.5 bg-brand-700 dark:bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-800 transition-colors shadow-sm">
                Search
              </button>
            )}
          </div>
        </div>

        {/* Quick filter pill row — always visible */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {/* Type pill */}
          <div className="relative">
            <select
              value={type}
              onChange={e => setParam('type', e.target.value)}
              className={PILL_SELECT_CLASS}
              style={{
                backgroundImage: CHEVRON_SVG,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '12px',
              }}
            >
              {TYPES.map(o => (
                <option key={o.value} value={o.value}>
                  {o.value === '' ? 'Job Type' : o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Level pill */}
          <div className="relative">
            <select
              value={level}
              onChange={e => setParam('level', e.target.value)}
              className={PILL_SELECT_CLASS}
              style={{
                backgroundImage: CHEVRON_SVG,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '12px',
              }}
            >
              {LEVELS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.value === '' ? 'Level' : o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Posted within pill */}
          <div className="relative">
            <select
              value={posted}
              onChange={e => setParam('posted', e.target.value)}
              className={PILL_SELECT_CLASS}
              style={{
                backgroundImage: CHEVRON_SVG,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '12px',
              }}
            >
              {POSTED_WITHIN.map(o => (
                <option key={o.value} value={o.value}>
                  {o.value === '' ? 'Posted Within' : o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Remote only toggle pill */}
          <button
            onClick={() => setParam('remote', remoteOnly === 'true' ? '' : 'true')}
            className={cn(
              'text-xs font-semibold border rounded-full px-3 py-1.5 transition-all cursor-pointer',
              remoteOnly === 'true'
                ? 'bg-brand-700 dark:bg-brand-600 text-white border-brand-700 dark:border-brand-600'
                : 'border-stone-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0a1628] text-stone-600 dark:text-stone-300 hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400'
            )}
          >
            {remoteOnly === 'true' ? '✓ Remote only' : 'Remote only'}
          </button>
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
            {type && (
              <FilterChip
                label={TYPES.find(t => t.value === type)?.label}
                onRemove={() => setParam('type', '')}
              />
            )}
            {level && (
              <FilterChip
                label={LEVELS.find(l => l.value === level)?.label}
                onRemove={() => setParam('level', '')}
              />
            )}
            {country && (
              <FilterChip
                label={COUNTRIES.find(c => c.value === country)?.label?.replace(/^\S+\s/, '')}
                onRemove={() => setParam('country', '')}
              />
            )}
            {posted && (
              <FilterChip
                label={POSTED_WITHIN.find(p => p.value === posted)?.label}
                onRemove={() => setParam('posted', '')}
              />
            )}
            {remoteOnly && (
              <FilterChip label="Remote only" onRemove={() => setParam('remote', '')} />
            )}
          </div>
        )}

        {/* Advanced filters panel */}
        {showFilters && (
          <div className="mt-3 p-5 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Country — first, full-width on mobile */}
              <div className="col-span-2 sm:col-span-2 lg:col-span-2">
                <CountrySelect value={country} onChange={v => setParam('country', v)} />
              </div>
              <FilterSelect label="Region"       value={region}      onChange={v => setParam('region', v)}      options={REGIONS}       icon={<Flag className="w-3 h-3" />}        />
              <FilterSelect label="Job Type"     value={type}        onChange={v => setParam('type', v)}        options={TYPES}         icon={<Briefcase className="w-3 h-3" />}    />
              <FilterSelect label="Level"        value={level}       onChange={v => setParam('level', v)}       options={LEVELS}        icon={<TrendingUp className="w-3 h-3" />}   />
              <FilterSelect label="Salary"       value={salary}      onChange={v => setParam('salary', v)}      options={SALARY_RANGES} icon={<Banknote className="w-3 h-3" />}     />
              <FilterSelect label="Timezone"     value={timezone}    onChange={v => setParam('timezone', v)}    options={TIMEZONES}     icon={<Timer className="w-3 h-3" />}        />
              <FilterSelect label="Posted"       value={posted}      onChange={v => setParam('posted', v)}      options={POSTED_WITHIN} icon={<Clock className="w-3 h-3" />}        />
              <FilterSelect label="Remote"       value={remoteOnly}  onChange={v => setParam('remote', v)}      options={REMOTE_OPTIONS}icon={<Globe2 className="w-3 h-3" />}       />
              <FilterSelect label="Company Size" value={companySize} onChange={v => setParam('companySize', v)} options={COMPANY_SIZES} icon={<Building2 className="w-3 h-3" />}    />
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
      </div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-5">
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

      {/* Results header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100">
            {q ? `Results for "${q}"` : category === 'all' ? 'All Remote Jobs' : `${catMeta.label} Jobs`}
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">
            {loading ? 'Searching…' : `${total.toLocaleString()} jobs found`}
            {!loading && total > 0 && <span className="ml-1.5 inline-flex items-center gap-1 text-brand-700 dark:text-brand-400"><Zap className="w-3 h-3" />Updated daily</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasActive && (
            <button onClick={clearAll} className="text-xs text-stone-400 hover:text-red-500 transition-colors flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Clear all
            </button>
          )}
          {/* Grid / List toggle */}
          <div className="flex items-center gap-0.5 p-1 rounded-lg border border-stone-200 dark:border-[#1e3a5f] bg-white dark:bg-[#0a1628]">
            <button
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              className={cn('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-brand-700 text-white' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-label="List view"
              className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-brand-700 text-white' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300')}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid / List */}
      {loading ? (
        <div className={cn(viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'flex flex-col gap-3')}>
          {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-2xl p-16 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2">No jobs found</h2>
          <p className="text-stone-400 dark:text-stone-500 mb-5 max-w-sm mx-auto text-sm">Try different keywords or remove some filters.</p>
          <button onClick={clearAll} className="px-6 py-2.5 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-800 transition-colors">
            Show all jobs
          </button>
        </div>
      ) : (
        <>
          <div className={cn(viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'flex flex-col gap-2', 'mb-8')}>
            {jobs.map(job => <JobCard key={job.id} job={job} listMode={viewMode === 'list'} />)}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              <button onClick={() => setPage(page - 1)} disabled={page <= 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-[#1e3a5f] text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0a1628] disabled:opacity-40 transition-colors">
                <ChevronLeft className="w-4 h-4" />Previous
              </button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                const p = pages <= 5 ? i + 1 : i === 0 ? 1 : i === 4 ? pages : page - 1 + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn('w-10 h-10 rounded-xl text-sm font-bold transition-all',
                      p === page ? 'bg-brand-700 dark:bg-brand-600 text-white shadow-md-brand' : 'border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0a1628]')}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(page + 1)} disabled={page >= pages}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 dark:border-[#1e3a5f] text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0a1628] disabled:opacity-40 transition-colors">
                Next<ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
