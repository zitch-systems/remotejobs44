// components/ui/BrandLoader.tsx — branded loading animation for the web app.
// The RemoteJobs44 logo mark (blue tile + white chart-line + orange dot) pulses
// inside a spinning brand-blue ring. Mirrors the mobile BrandLoader so loading
// states look consistent across app + web.
export function BrandLoader({ size = 64, label }: { size?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="relative" style={{ width: size, height: size }}>
        {/* spinning brand ring */}
        <div
          className="absolute inset-0 rounded-full border-[3px] border-slate-200 dark:border-slate-700 animate-spin"
          style={{ borderTopColor: '#2563eb', animationDuration: '0.9s' }}
        />
        {/* pulsing logo mark */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            viewBox="0 0 40 40"
            fill="none"
            className="animate-pulse"
            style={{ width: size * 0.55, height: size * 0.55 }}
          >
            <rect width="40" height="40" rx="11" fill="#2563eb" />
            <path d="M10 26 Q15 12 20 20 Q25 28 29 15" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
            <circle cx="29" cy="15" r="3.5" fill="#f97316" />
          </svg>
        </div>
      </div>
      {label ? <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p> : null}
    </div>
  );
}

/** Full-height centered branded loader for route/page loading states. */
export function BrandLoaderScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <BrandLoader label={label} />
    </div>
  );
}
