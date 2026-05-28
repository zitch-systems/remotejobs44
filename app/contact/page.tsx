// app/contact/page.tsx — Server-rendered shell + ContactForm client island.
// Was 'use client' over the whole tree even though the static parts
// (heading, description, email-us-directly link) don't need it.
import type { Metadata } from 'next';
import { ContactForm } from '@/components/contact/ContactForm';

const URL = 'https://remotejobs44.com/contact';

export const metadata: Metadata = {
  title: 'Contact RemoteJobs44',
  description: 'Have a question, feedback, or need help? Reach the RemoteJobs44 team. We respond within 24–48 hours.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Contact RemoteJobs44',
    description: 'Have a question, feedback, or need help? Reach the RemoteJobs44 team.',
    url: URL,
    type: 'website',
  },
};

export default function ContactPage() {
  return (
    <div className="max-w-[620px] mx-auto px-5 py-16">
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 mb-3">
          Contact Us
        </h1>
        <p className="text-stone-500 dark:text-stone-400">
          Have a question, feedback, or need help? We&rsquo;d love to hear from you. We typically respond within 24–48 hours.
        </p>
      </div>

      <ContactForm />

      <div className="mt-6 flex flex-col sm:flex-row gap-4 text-sm text-stone-400 dark:text-stone-500">
        <span>Or email us directly:</span>
        <a href="mailto:hello@remotejobs44.com" className="text-brand-700 dark:text-brand-400 hover:underline font-medium">
          hello@remotejobs44.com
        </a>
      </div>
    </div>
  );
}
