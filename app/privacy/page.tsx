import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Privacy Policy' };
export default function PrivacyPage() {
  return (
    <div className="max-w-[800px] mx-auto px-5 py-16">
      <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 mb-2">Privacy Policy</h1>
      <p className="text-stone-400 text-sm mb-8">Last updated: January 2025</p>
      {[
        { title: 'Information We Collect', body: 'We collect your name, email address, and payment information when you create an account or subscribe. We also collect usage data to improve our service.' },
        { title: 'How We Use Your Information', body: 'Your information is used to provide and improve our service, process payments, and send you relevant job alerts (only if you opt in).' },
        { title: 'Data Storage', body: 'Your data is stored securely using Supabase. Payment information is handled entirely by Paystack and is never stored on our servers.' },
        { title: 'Third Parties', body: 'We use Supabase (database), Paystack (payments), and Vercel (hosting). We do not sell your personal data to any third party.' },
        { title: 'Your Rights', body: 'You may request deletion of your account and data at any time by emailing hello@remotejobs44.com.' },
        { title: 'Contact', body: 'Questions? Email us at hello@remotejobs44.com.' },
      ].map(s => (
        <div key={s.title} className="mb-6">
          <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">{s.title}</h2>
          <p className="text-stone-500 dark:text-stone-400 leading-relaxed">{s.body}</p>
        </div>
      ))}