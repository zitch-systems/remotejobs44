'use client';
// app/admin/jobs/new/page.tsx — Manual job posting form
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Eye, ArrowLeft, Plus, X } from 'lucide-react';
import { jobsApi } from '@/lib/api';
import { useUIStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { JobCategory, JobType, JobLevel } from '@/lib/types';

const CATEGORIES: JobCategory[] = ['engineering','design','marketing','finance','sales','data','hr','product','legal','operations','other'];
const TYPES: JobType[] = ['full-time','part-time','contract','freelance'];
const LEVELS: JobLevel[] = ['entry','mid','senior','lead','executive'];

export default function NewJobPage() {
  const router = useRouter();
  const { toast } = useUIStore();
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const [form, setForm] = useState({
    title: '', company: '', logo: '', location: 'Worldwide', timezone: '',
    category: 'engineering' as JobCategory,
    type: 'full-time' as JobType,
    level: 'mid' as JobLevel,
    salaryMin: '', salaryMax: '', currency: 'USD',
    description: '', applyUrl: '', applyEmail: '',
    featured: false,
    skillInput: '', skills: [] as string[],
    reqInput: '', requirements: [] as string[],
    benefitInput: '', benefits: [] as string[],
  });

  function set(key: string, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addChip(listKey: string, inputKey: string) {
    const val = (form as any)[inputKey].trim();
    if (!val) return;
    set(listKey, [...(form as any)[listKey], val]);
    set(inputKey, '');
  }

  function removeChip(listKey: string, idx: number) {
    set(listKey, (form as any)[listKey].filter((_: any, i: number) => i !== idx));
  }

  async function handleSave(asDraft = false) {
    if (!form.title || !form.company || !form.description) {
      toast('Title, company and description are required', 'error'); return;
    }
    setSaving(true);
    try {
      const job = await jobsApi.createJob({
        title: form.title, company: form.company, logo: form.logo || form.company[0].toUpperCase(),
        location: form.location, timezone: form.timezone || undefined,
        category: form.category, type: form.type, level: form.level,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
        currency: form.currency,
        description: form.description,
        applyUrl: form.applyUrl || undefined,
        applyEmail: form.applyEmail || undefined,
        featured: form.featured,
        skills: form.skills,
        requirements: form.requirements,
        benefits: form.benefits,
        remote: true,
        source: 'manual',
      });
      toast(`Job "${form.title}" ${asDraft ? 'saved as draft' : 'published'} ✅`, 'success');
      router.push('/admin/jobs');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'input text-sm';
  const labelClass = 'block text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1.5';

  return (
    <div className="max-w-[800px] mx-auto px-5 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button onClick={() => router.back()} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-display font-extrabold text-xl text-stone-900 dark:text-stone-100">Post a Job</h1>
          <p className="text-xs text-stone-400 dark:text-stone-500">Manually create and publish a job listing</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPreview(!preview)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-stone-200 dark:border-[#234533] rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-colors">
            <Eye className="w-4 h-4" /> {preview ? 'Edit' : 'Preview'}
          </button>
          <button onClick={() => handleSave(false)} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 disabled:opacity-60 transition-colors">
            <Save className="w-4 h-4" />
            {saving ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* Basic info */}
        <div className="card p-5">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Job Title *</label>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Senior Frontend Engineer" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Company Name *</label>
              <input value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Acme Corp" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Company Logo (letter or emoji)</label>
              <input value={form.logo} onChange={(e) => set('logo', e.target.value)} placeholder="A" maxLength={2} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Category *</label>
              <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputClass}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Job Type *</label>
              <select value={form.type} onChange={(e) => set('type', e.target.value)} className={inputClass}>
                {TYPES.map((t) => <option key={t} value={t}>{t.replace('-', ' ').replace(/^\w/, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Experience Level</label>
              <select value={form.level} onChange={(e) => set('level', e.target.value)} className={inputClass}>
                {LEVELS.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Worldwide" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Timezone</label>
              <input value={form.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="e.g. UTC-5 to UTC+2" className={inputClass} />
            </div>
          </div>
        </div>

        {/* Salary */}
        <div className="card p-5">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-4">Compensation (optional)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Min Salary / yr</label>
              <input type="number" value={form.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} placeholder="80000" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Max Salary / yr</label>
              <input type="number" value={form.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} placeholder="120000" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Currency</label>
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={inputClass}>
                {['USD','EUR','GBP','CAD','AUD'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="card p-5">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-4">Job Description *</h2>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Describe the role, what the team does, what you'll work on…"
            rows={10}
            className={cn(inputClass, 'resize-y min-h-[200px]')}
          />
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">{form.description.length} characters</p>
        </div>

        {/* Skills */}
        <div className="card p-5">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3">Skills & Technologies</h2>
          <div className="flex gap-2 mb-3">
            <input
              value={form.skillInput}
              onChange={(e) => set('skillInput', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChip('skills', 'skillInput'))}
              placeholder="e.g. React, TypeScript…"
              className={cn(inputClass, 'flex-1')}
            />
            <button onClick={() => addChip('skills', 'skillInput')}
              className="px-3 py-2 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.skills.map((s, i) => (
              <span key={i} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-stone-100 dark:bg-[#1C3829] text-stone-600 dark:text-stone-300 text-xs font-semibold border border-stone-200 dark:border-[#234533]">
                {s}
                <button onClick={() => removeChip('skills', i)} className="text-stone-400 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Requirements */}
        <div className="card p-5">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-3">Requirements</h2>
          <div className="flex gap-2 mb-3">
            <input
              value={form.reqInput}
              onChange={(e) => set('reqInput', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChip('requirements', 'reqInput'))}
              placeholder="e.g. 5+ years React experience"
              className={cn(inputClass, 'flex-1')}
            />
            <button onClick={() => addChip('requirements', 'reqInput')}
              className="px-3 py-2 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 rounded-lg hover:bg-brand-100 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-2">
            {form.requirements.map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-600 dark:bg-brand-400 shrink-0" />
                <span className="flex-1">{r}</span>
                <button onClick={() => removeChip('requirements', i)} className="text-stone-300 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Apply info */}
        <div className="card p-5">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-4">Application Details (visible to subscribers only)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Apply URL</label>
              <input type="url" value={form.applyUrl} onChange={(e) => set('applyUrl', e.target.value)} placeholder="https://..." className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Apply Email</label>
              <input type="email" value={form.applyEmail} onChange={(e) => set('applyEmail', e.target.value)} placeholder="jobs@company.com" className={inputClass} />
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="card p-5">
          <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-4">Options</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 dark:border-[#234533] text-brand-700 focus:ring-brand-600" />
            <div>
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">⭐ Featured listing</p>
              <p className="text-xs text-stone-400 dark:text-stone-500">Displayed with a gold border and shown first in search results</p>
            </div>
          </label>
        </div>

        {/* Publish button */}
        <div className="flex gap-3 justify-end pb-8">
          <button onClick={() => handleSave(true)} disabled={saving}
            className="px-4 py-2.5 text-sm font-semibold border border-stone-200 dark:border-[#234533] rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-[#1C3829] transition-colors disabled:opacity-60">
            Save Draft
          </button>
          <button onClick={() => handleSave(false)} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-60 transition-colors">
            <Save className="w-4 h-4" />
            {saving ? 'Publishing…' : 'Publish Job'}
          </button>
        </div>
      </div>
    </div>
  );
}
