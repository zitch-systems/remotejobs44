// app/jobs/loading.tsx — route-level loading skeleton.
//
// /jobs is a server component running a cold FTS / count over the jobs
// table that can take a few seconds; with maxDuration=30 and no loading
// UI the route streamed nothing until the fetch resolved (blank screen on
// a cold hit). This skeleton mirrors the filter bar + card grid so the
// shell paints instantly.
export default function JobsLoading() {
  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-5 py-6 animate-pulse">
      <div className="skeleton h-12 w-full rounded-xl mb-4" />
      <div className="flex gap-2 mb-5 flex-wrap">
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-8 w-24 rounded-full" />)}
      </div>
      <div className="skeleton h-5 w-40 rounded mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
      </div>
    </div>
  );
}
