import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Contact Us' };
export default function ContactPage() {
  return (
    <div className="max-w-[600px] mx-auto px-5 py-16">
      <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 mb-4">Contact Us</h1>
      <p className="text-stone-500 dark:text-stone-400 mb-8">Have a question or need help? We'd love to hear from you.</p>
      <div className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Name</label>
          <input type="text" className="input" placeholder="Your name" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Email</label>
          <input type="email" className="input" placeholder="you@example.com" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Message</label>
          <textarea className="input min-h-[120px] resize-y" placeholder="How can we help?" />
        </div>
        <button className="px-6 py-3 bg-brand-700 text-white font-bold rounded-lg hover:bg-brand-600 transition-colors">
          Send Message
        </button>
      </div>
      <p className="text-sm text-stone-400 mt-6">Or email us directly: <a href="mailto:hello@remotejobs44.com" className="text-brand-700 dark:text-brand-400 hover:underline">hello@remotejobs44.com</a></p>
    </div>
  );
}
