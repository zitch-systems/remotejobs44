'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Save, Loader2 } from 'lucide-react';
import { jobsApi } from '@/lib/api';
import { useUIStore } from '@/lib/store';
import { CATEGORY_META } from '@/lib/utils';
import type { JobCategory, JobType, JobLevel } from '@/lib/types';

const CATEGORIES = Object.entries(CATEGORY_META)
  .filter(([k]) => k !== 'all')
  .map(([value, m]) => ({ value, label: `${m.icon} ${m.label}` }));

const TYPES: { value: JobType; label: string }[] = [
  { value:'full-time',  label:'Full-time' },
  { value:'part-time',  label:'Part-time' },
  { value:'contract',   label:'Contract' },
  { value:'freelance',  label:'Freelance' },
];

const LEVELS: { value: JobLevel; label: string }[] = [
  { value:'entry',     label:'Entry level' },
  { value:'mid',       label:'Mid level' },
  { value:'senior',    label:'Senior' },
  { value:'lead',      label:'Lead / Staff' },
  { value:'executive', label:'Executive / VP' },
];

// Declared at module scope — NOT inside NewJobPage. When this lived inside the
// component, every keystroke produced a new `Field` function identity, so React
// unmounted and remounted the entire subtree (including the <input>) on each
// character, blurring the focused field after every letter. Hoisting keeps the
// component type stable across renders so inputs retain focus.
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-stone-500 mt-1">{hint}</p>}
    </div>
  );
}

export default function NewJobPage() {
  const router  = useRouter();
  const { toast } = useUIStore();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '', company: '', logo: '',
    category: 'engineering' as JobCategory,
    type: 'full-time' as JobType,
    level: 'mid' as JobLevel,
    location: 'Worldwide', timezone: 'Any',
    salaryMin: '', salaryMax: '', currency: 'USD',
    description: '',
    requirements: '',
    skills: '',
    benefits: '',
    applyUrl: '', applyEmail: '',
    featured: false,
  });

  function set(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.company || !form.description) {
      toast('Title, company and description are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await jobsApi.createJob({
        ...form,
        logo: form.logo || form.company[0].toUpperCase(),
        salaryMin: form.salaryMin ? parseInt(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? parseInt(form.salaryMax) : undefined,
        requirements: form.requirements ? form.requirements.split('\n').filter(Boolean) : [],
        skills: form.skills ? form.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
        benefits: form.benefits ? form.benefits.split('\n').filter(Boolean) : [],
      });
      toast('Job posted successfully! ✅', 'success');
      router.push('/admin/jobs');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[800px] mx-auto px-5 py-8">
      <div className="flex items-center gap-3 mb-7">
        <Link href="/admin/jobs" className="p-2 rounded-lg border border-stone-200 dark:border-[#1e3a5f] hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors">
          <ArrowLeft className="w-4 h-4 text-stone-500" />
        </Link>
        <div>
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Post New Job</h1>
          <p className="text-sm text-stone-400 mt-0.5">Fill in the details below to publish a job listing</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="card p-6">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-5 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center text-xs font-black">1</span>
            Basic Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Job Title *">
              <input value={form.title} onChange={e => set('title', e.target.value)}
                className="input" placeholder="e.g. Senior Frontend Engineer" required />
            </Field>
            <Field label="Company Name *">
              <input value={form.company} onChange={e => set('company', e.target.value)}
                className="input" placeholder="e.g. Stripe" required />
            </Field>
            <Field label="Company Logo" hint="Leave blank to use first letter of company name">
              <input value={form.logo} onChange={e => set('logo', e.target.value)}
                className="input" placeholder="Letter or emoji e.g. S or 🚀" />
            </Field>
            <Field label="Category *">
              <select value={form.category} onChange={e => set('category', e.target.value)} className="input">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Job Type">
              <select value={form.type} onChange={e => set('type', e.target.value)} className="input">
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Level">
              <select value={form.level} onChange={e => set('level', e.target.value)} className="input">
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* Location + Salary */}
        <div className="card p-6">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-5 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center text-xs font-black">2</span>
            Location & Compensation
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Location">
              <input value={form.location} onChange={e => set('location', e.target.value)} className="input" placeholder="Worldwide" />
            </Field>
            <Field label="Timezone">
              <input value={form.timezone} onChange={e => set('timezone', e.target.value)} className="input" placeholder="Any" />
            </Field>
            <Field label="Currency">
              <select value={form.currency} onChange={e => set('currency', e.target.value)} className="input">
                {['USD','EUR','GBP','NGN','CAD','AUD'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Min Salary / year">
              <input type="number" value={form.salaryMin} onChange={e => set('salaryMin', e.target.value)}
                className="input" placeholder="60000" />
            </Field>
            <Field label="Max Salary / year">
              <input type="number" value={form.salaryMax} onChange={e => set('salaryMax', e.target.value)}
                className="input" placeholder="120000" />
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-brand-700 focus:ring-brand-600" />
                <span className="text-sm font-semibold text-stone-700 dark:text-stone-300">⭐ Featured job</span>
              </label>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="card p-6">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-5 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center text-xs font-black">3</span>
            Job Content
          </h2>
          <div className="space-y-4">
            <Field label="Job Description *" hint="Markdown supported">
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                className="input min-h-[160px] resize-y font-mono text-xs" required
                placeholder="Describe the role, team, and what success looks like..." />
            </Field>
            <Field label="Requirements" hint="One per line">
              <textarea value={form.requirements} onChange={e => set('requirements', e.target.value)}
                className="input min-h-[100px] resize-y"
                placeholder={"5+ years React experience\nStrong TypeScript skills\nRemote-first mindset"} />
            </Field>
            <Field label="Skills" hint="Comma-separated">
              <input value={form.skills} onChange={e => set('skills', e.target.value)}
                className="input" placeholder="React, TypeScript, GraphQL, Node.js" />
            </Field>
            <Field label="Benefits" hint="One per line">
              <textarea value={form.benefits} onChange={e => set('benefits', e.target.value)}
                className="input min-h-[80px] resize-y"
                placeholder={"Competitive salary\nRemote stipend $1,000/yr\nHealth insurance"} />
            </Field>
          </div>
        </div>

        {/* Apply links */}
        <div className="card p-6">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-5 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center text-xs font-black">4</span>
            Apply Details <span className="text-xs font-normal text-stone-400">(visible to Pro subscribers only)</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Apply URL">
              <input type="url" value={form.applyUrl} onChange={e => set('applyUrl', e.target.value)}
                className="input" placeholder="https://company.com/jobs/apply" />
            </Field>
            <Field label="Apply Email">
              <input type="email" value={form.applyEmail} onChange={e => set('applyEmail', e.target.value)}
                className="input" placeholder="careers@company.com" />
            </Field>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-8 py-3 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-800 disabled:opacity-60 transition-colors shadow-md-brand">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Publishing…' : 'Publish Job'}
          </button>
          <Link href="/admin/jobs"
            className="px-6 py-3 border border-stone-200 dark:border-[#1e3a5f] rounded-xl text-sm font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
