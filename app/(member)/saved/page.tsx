'use client';
// app/saved/page.tsx — the user's saved jobs.
//
// saved_jobs has had a server data layer since the cross-device-sync
// feature, but the only surface was a 3-item preview on /dashboard — past
// three, saved jobs were un-viewable. This is the full listing.
//
// /api/saved-jobs is both the auth gate and the authoritative id set;
// job details come from /api/jobs?ids= (which the dashboard preview also
// uses). That endpoint caps the IN list at 10, so we chunk + merge.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookmarkCheck, ArrowRight, Briefcase } from 'lucide-react';
import { useJobsStore } from '@/lib/store';
import { JobCard } from '@/components/jobs/JobCard';
import { VerifyEmailBanner } from '@/components/auth/VerifyEmailBanner';
import type { Job } from '@/lib/types';

// /api/jobs?ids= caps the IN list at 10, so fetch in chunks and merge.
// `ok` is false if ANY chunk failed so the caller can tell a transient
// network error apart from jobs that are genuinely gone — otherwise a
// single blip would wrongly tell the user their saves were removed.
async function fetchJobsByIds(ids: string[]): Promise<{ jobs: Job[]; ok: boolean }> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  let ok = true;
  const results = await Promise.all(
    chunks.map(chunk =>
      fetch(`/api/jobs?ids=${chunk.join(',')}`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { jobs?: Job[] }) => d.jobs ?? [])
        .catch(() => { ok = false; return [] as Job[]; }),
    ),
  );
  return { jobs: results.flat(), ok };
}

function SavedContent() {
  const router = useRouter();
  const savedJobIds    = useJobsStore(s => s.savedJobIds);
  const setSavedJobIds = useJobsStore(s => s.setSavedJobIds);
  const [checked, setChecked]     = useState(false);
  const [jobs, setJobs]           = useState<Job[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const failsafe = setTimeout(() => { if (!cancelled) setChecked(true); }, 10000);
    (async () => {
      let ids: string[] = savedJobIds;
      // /api/saved-jobs is the auth gate + authoritative set.
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch('/api/saved-jobs', { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(t);
        if (cancelled) return;
        if (res.status === 401) { router.replace('/login?next=/saved'); return; }
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.savedJobIds)) {
            ids = data.savedJobIds;
            setSavedJobIds(ids); // server is source of truth on load (replace)
          }
        }
      } catch {}
      if (cancelled) return;
      if (ids.length === 0) { setJobs([]); setLoadError(false); setChecked(true); return; }
      const { jobs: fetched, ok } = await fetchJobsByIds(ids);
      if (!cancelled) { setJobs(fetched); setLoadError(!ok); setChecked(true); }
    })();
    return () => { cancelled = true; clearTimeout(failsafe); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter the fetched details against the live store so an unsave on this
  // page (JobCard's bookmark) removes the card instantly, and keep the
  // saved order from the store.
  const visible = savedJobIds
    .map(id => jobs.find(j => j.id === id))
    .filter((j): j is Job => !!j);
  // Only count ids as "gone" when the fetch actually succeeded — a failed
  // chunk must not be reported as a permanently-removed job.
  const unavailable = loadError ? 0 : savedJobIds.length - visible.length;

  if (!checked) return (
    <div className="max-w-[1200px] mx-auto px-5 py-8 animate-pulse">
      <div className="skeleton h-8 w-48 rounded mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-48 rounded-xl" />)}
      </div>
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-8">
      <VerifyEmailBanner />
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight flex items-center gap-2">
            <BookmarkCheck className="w-6 h-6 text-amber-500" /> Saved Jobs
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">
            {savedJobIds.length} {savedJobIds.length === 1 ? 'job' : 'jobs'} saved
          </p>
        </div>
        <Link href="/jobs"
          className="flex items-center gap-2 px-4 py-2 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
          <Briefcase className="w-4 h-4" /> Browse Jobs
        </Link>
      </div>

      {savedJobIds.length === 0 ? (
        // True empty state — nothing saved.
        <div className="card p-16 text-center">
          <BookmarkCheck className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-4" />
          <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2">No saved jobs yet</h2>
          <p className="text-stone-400 dark:text-stone-500 mb-6 max-w-sm mx-auto">
            Tap the bookmark on any job to save it here for later.
          </p>
          <Link href="/jobs"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors">
            Browse Jobs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : visible.length === 0 ? (
        loadError ? (
          // Has saved ids, but the detail fetch failed — offer a retry, do
          // NOT claim the jobs were removed.
          <div className="card p-16 text-center">
            <div className="text-5xl mb-3">⚠️</div>
            <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2">Couldn&rsquo;t load your saved jobs</h2>
            <p className="text-stone-400 dark:text-stone-500 mb-6 max-w-sm mx-auto">
              We hit a hiccup talking to the server — your saves are safe. Refresh to try again.
            </p>
            <button onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors">
              Try again
            </button>
          </div>
        ) : (
          // Has saved ids, fetch succeeded, but none are still active.
          <div className="card p-16 text-center">
            <BookmarkCheck className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-4" />
            <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2">Your saved jobs are no longer available</h2>
            <p className="text-stone-400 dark:text-stone-500 mb-6 max-w-sm mx-auto">
              The {savedJobIds.length === 1 ? 'job you saved has' : `${savedJobIds.length} jobs you saved have`} expired or been removed. Browse the latest openings below.
            </p>
            <Link href="/jobs"
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors">
              Browse Jobs <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map(job => <JobCard key={job.id} job={job} />)}
          </div>
          {unavailable > 0 && (
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-6 text-center">
              {unavailable} saved {unavailable === 1 ? 'job is' : 'jobs are'} no longer available and {unavailable === 1 ? 'was' : 'were'} hidden.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function SavedJobsPage() {
  return <SavedContent />;
}
