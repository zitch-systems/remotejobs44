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
          Browse free. Get full access from ₦500. Work from anywhere in the world.
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

        {/* Social + contact — visible at the bottom of the landing page on
            both mobile (where the Footer is hidden) and desktop. Email +
            WhatsApp are direct chat entry points so prospects can reach us
            without leaving the page. */}
        <div className="mt-10 pt-8 border-t border-white/15">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-4">Connect with us</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href="https://facebook.com/remotejobs44"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="RemoteJobs44 on Facebook"
              title="Facebook"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
            <a
              href="https://instagram.com/remotejobs_44"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="RemoteJobs44 on Instagram"
              title="Instagram"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </a>
            <a
              href="https://wa.me/2349169582776"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat with RemoteJobs44 on WhatsApp"
              title="WhatsApp"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
            <a
              href="https://www.tiktok.com/@remotejobs_44"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="RemoteJobs44 on TikTok"
              title="TikTok"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.2 8.2 0 004.79 1.53V6.77a4.85 4.85 0 01-1.02-.08z"/>
              </svg>
            </a>
            <a
              href="mailto:hello@remotejobs44.com"
              aria-label="Email RemoteJobs44"
              title="Email hello@remotejobs44.com"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-colors"
            >
              <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
              </svg>
            </a>
          </div>
          <p className="mt-4 text-xs text-white/60">
            <a href="mailto:hello@remotejobs44.com" className="hover:text-white transition-colors">hello@remotejobs44.com</a>
            <span className="mx-2 text-white/30">·</span>
            <a href="https://wa.me/2349169582776" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">+234 916 958 2776</a>
          </p>
        </div>
      </div>
    </section>
  );
}
