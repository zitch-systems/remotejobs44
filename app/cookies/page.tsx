import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Cookie Policy' };
export default function CookiesPage() {
  return (
    <div className="max-w-[800px] mx-auto px-5 py-16">
      <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 mb-2">Cookie Policy</h1>
      <p className="text-stone-400 text-sm mb-8">Last updated: January 2025</p>
      {[
        { title: 'What Are Cookies', body: 'Cookies are small text files stored on your device. We use them to keep you logged in and remember your preferences.' },
        { title: 'Cookies We Use', body: 'Session cookies (authentication), preference cookies (theme, language), and analytics cookies (anonymous usage data to improve the platform).' },
        { title: 'Managing Cookies', body: 'You can disable cookies in your browser settings. Note that disabling cookies may prevent you from staying logged in.' },
        { title: 'Contact', body: 'Questions? Email us at hello@remotejobs44.com.' },
      ].map(s => (
        <div key={s.title} className="mb-6">
          <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">{s.title}</h2>
          <p className="text-stone-500 dark:text-stone-400 leading-relaxed">{s.body}</p>
        </div>
      ))}
    </div>
  );
}
