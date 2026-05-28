'use client';
// components/contact/ContactForm.tsx
//
// Form-only client island. The page shell (heading, description,
// "email us directly" footer) is now server-rendered.
import { useState } from 'react';
import { Mail, MessageSquare, User, Send, CheckCircle } from 'lucide-react';

export function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }
      setStatus('success');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setError('Failed to send message. Please check your connection and try again.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="card p-8 text-center">
        <div className="w-14 h-14 bg-brand-50 dark:bg-brand-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-7 h-7 text-brand-600 dark:text-brand-400" />
        </div>
        <h2 className="font-display font-bold text-xl text-stone-900 dark:text-stone-100 mb-2">Message sent!</h2>
        <p className="text-stone-500 dark:text-stone-400 mb-6">
          Thanks for reaching out. We&rsquo;ll get back to you soon.
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="px-5 py-2.5 border border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 font-semibold rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors text-sm"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
            <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Name</span>
          </label>
          <input
            type="text" name="name" value={form.name} onChange={handleChange} required
            className="input w-full" placeholder="Your name"
            disabled={status === 'sending'}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</span>
          </label>
          <input
            type="email" name="email" value={form.email} onChange={handleChange} required
            className="input w-full" placeholder="you@example.com"
            disabled={status === 'sending'}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
          Subject <span className="text-stone-400 font-normal">(optional)</span>
        </label>
        <input
          type="text" name="subject" value={form.subject} onChange={handleChange}
          className="input w-full" placeholder="What's this about?"
          disabled={status === 'sending'}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
          <span className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Message</span>
        </label>
        <textarea
          name="message" value={form.message} onChange={handleChange} required
          rows={5}
          className="input w-full resize-y min-h-[120px]"
          placeholder="How can we help?"
          disabled={status === 'sending'}
          maxLength={2000}
        />
        <p className="text-xs text-stone-400 mt-1 text-right">{form.message.length}/2000</p>
      </div>

      {status === 'error' && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-600 dark:hover:bg-brand-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === 'sending' ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Send Message
          </>
        )}
      </button>
    </form>
  );
}
