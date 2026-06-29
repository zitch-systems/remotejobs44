// components/member/MemberLoading.tsx
// Shown by member tool screens while the auth store is confirming the
// session (so the tool never flashes to a signed-out visitor before the
// gate redirects them to /login).
export function MemberLoading() {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: 'calc(100dvh - 60px)',
        color: 'var(--fg-3)',
        fontSize: 14,
      }}
    >
      <div className="rj-spin" aria-label="Loading" role="status" />
      <style>{`
        .rj-spin { width: 28px; height: 28px; border-radius: 50%;
          border: 3px solid var(--border-2); border-top-color: var(--brand-600);
          animation: rj-spin 0.7s linear infinite; }
        @keyframes rj-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .rj-spin { animation: none; } }
      `}</style>
    </div>
  );
}
