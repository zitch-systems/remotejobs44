import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Terms of Service' };
export default function TermsPage() {
  return (
    <div className="max-w-[800px] mx-auto px-5 py-16 prose prose-stone dark:prose-invert">
      <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 mb-2">Terms of Service</h1>
      <p className="text-stone-400 text-sm mb-8">Last updated: January 2025</p>
      {[
        { title: '1. Acceptance of Terms', body: 'By accessing RemoteJobs44, you agree to these Terms of Service. If you do not agree, please do not use the platform.' },
        { title: '2. Use of Service', body: 'RemoteJobs44 provides a job listing platform. You may browse jobs for free. A paid subscription is required to view apply links and contact employers.' },
        { title: '3. Subscriptions & Payments', body: 'Paid plans (Day Pass, Pro Monthly, Pro Annual) are processed securely via Paystack. Subscriptions renew automatically unless cancelled. You may cancel at any time from your dashboard.' },
        { title: '4. User Accounts', body: 'You are responsible for maintaining the confidentiality of your account. You must provide accurate information when creating an account.' },
        { title: '5. Intellectual Property', body: 'All content on RemoteJobs44 is owned by RemoteJobs44 or its licensors. You may not reproduce or redistribute content without permission.' },
        { title: '6. Limitation of Liability', body: 'RemoteJobs44 is provided "as is". We are not liable for any indirect, incidental, or consequential damages arising from use of the platform.' },
        { title: '7. Contact', body: 'Questions about these terms? Email us at hello@remotejobs44.com.' },
      ].map(s => (
        <div key={s.title} className="mb-6">
          <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-2">{s.title}</h2>
          <p className="text-stone-500 dark:text-stone-400 leading-relaxed">{s.body}</p>
        </div>
      ))