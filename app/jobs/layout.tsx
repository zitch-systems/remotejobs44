// app/jobs/layout.tsx — intentionally exports NO metadata.
//
// /jobs metadata lives in app/jobs/page.tsx (a Server Component). Two
// metadata exports on the same route segment silently override each other
// field-by-field, and the two had drifted out of sync. Keeping the single
// source on the page avoids that whole class of bug.
export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
