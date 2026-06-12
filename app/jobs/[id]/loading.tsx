// app/jobs/[id]/loading.tsx — route-level loading skeleton.
//
// The detail route renders dynamically (plan check reads cookies). On a
// data-cache miss — or for signed-in users, whose plan resolution always
// runs per-request — nothing streamed until the fetches resolved, leaving
// a blank viewport. This shell mirrors the detail layout (header card +
// 2/3–1/3 content grid) so the route paints immediately while the job
// body streams in.
export default function JobDetailLoading() {
  return (
    <div className="max-w-[900px] mx-auto px-5 py-8 animate-pulse">
      <div className="skeleton h-4 w-28 rounded mb-6" />
      <div className="skeleton h-36 w-full rounded-2xl mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-5/6 rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-2/3 rounded" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
