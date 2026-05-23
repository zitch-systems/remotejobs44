// components/home/CTASection.tsx — pure server component
import Link from 'next/link';

export function CTASection() {
  return (
    <section className="py-24 bg-brand-700 dark:bg-[#042314] relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,255,255,0.05), transparent)' }} />
      <div className="max-w-[700px] mx-auto px-5 text-center relative">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/20 bg-white/10 text-xs font-bold uppercase tracking-widest text-white/80 mb-6">
          🚀 Join 5,000+ job seekers
        </div>
        <h2 className="font-display font-extrabold text-white tracking-tight mb-4 leading-tight"
          style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)' }}>
          Your remote career<br />is one click away
        </h2>
        <p className="text-brand-200 mb-10 text-base max-w-md mx-auto leading-relaxed">
          Browse free. Get full access from ₦1,000. Work from anywhere in the world.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/jobs"
            className="px-8 py-4 bg-white text-brand-700 font-bold rounded-xl hover:bg-brand-50 transition-colors text-base shadow-sm">
            Browse Jobs
          </Link>
          <Link href="/register"
            className="px-8 py-4 border-2 border-white/40 text-white font-bold rounded-xl hover:border-white/70 hover:bg-white/5 transition-colors text-base">
            Get Started Free
          </Link>
        </div>
      </div>
    </section>
  );
}
/div>
    </section>
  );
}
