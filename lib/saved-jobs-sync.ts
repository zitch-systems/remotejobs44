// lib/saved-jobs-sync.ts
//
// Thin client-side wrappers around /api/saved-jobs. Kept separate
// from useJobsStore so the store stays pure (Zustand actions don't
// do I/O) and so callers can opt-in to optimistic-with-rollback or
// fire-and-forget depending on the surface.
//
// Pattern:
//   1. Component calls Zustand toggleSave() for instant UI.
//   2. Then awaits saveJobRemote() / unsaveJobRemote().
//   3. On failure, calls Zustand toggleSave() again to rollback +
//      surfaces a toast.

export async function fetchServerSavedJobs(): Promise<string[]> {
  try {
    const res = await fetch('/api/saved-jobs', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.savedJobIds) ? data.savedJobIds : [];
  } catch {
    return [];
  }
}

export async function saveJobRemote(jobId: string): Promise<{ ok: boolean }> {
  try {
    const res = await fetch('/api/saved-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export async function unsaveJobRemote(jobId: string): Promise<{ ok: boolean }> {
  try {
    // Query string instead of a JSON body — some HTTP intermediaries
    // strip bodies from DELETE requests. The server still tolerates
    // the old body shape for backwards compat.
    const res = await fetch(`/api/saved-jobs?jobId=${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
