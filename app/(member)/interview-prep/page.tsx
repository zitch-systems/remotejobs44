'use client';
// app/interview-prep/page.tsx — AI-powered interview prep tool.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Brain, Sparkles, AlertCircle, CheckCircle, MessageCircle, Shield, LogIn } from 'lucide-react';
import { useAuthStore, useUIStore } from '@/lib/store';
import { useMemberGate } from '@/lib/member/use-member-gate';
import { MemberLoading } from '@/components/member/MemberLoading';

interface PrepQ {
  q: string;
  what_it_tests: string;
  structure: string;
  common_mistake: string;
}
interface Prep {
  role: string;
  level: string;
  behavioral_questions: PrepQ[];
  technical_or_role_questions: PrepQ[];
  remote_specific_questions: PrepQ[];
  questions_to_ask_them: string[];
  red_flags_to_avoid: string[];
}

export default function InterviewPrepPage() {
  const router = useRouter();
  const { ready } = useMemberGate();
  const { isLoggedIn } = useAuthStore();
  const { toast } = useUIStore();
  const [role, setRole]   = useState('');
  const [level, setLevel] = useState<'entry'|'mid'|'senior'|'lead'|'executive'>('mid');
  const [focus, setFocus] = useState('');
  const [loading, setLoading] = useState(false);
  const [prep, setPrep] = useState<Prep | null>(null);

  async function generate() {
    if (!isLoggedIn()) { router.push('/login?next=/interview-prep'); return; }
    if (role.trim().length < 3) { toast('Enter a role (e.g. "Frontend Engineer")', 'error'); return; }
    setLoading(true); setPrep(null);
    try {
      const r = await fetch('/api/ai/interview-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: role.trim(), level, focus: focus.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      setPrep(j.prep);
    } catch (err: any) {
      toast(err.message ?? 'Generation failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <MemberLoading />;

  return (
    <div className="max-w-[860px] mx-auto px-5 py-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5" /> AI Interview Prep
        </div>
        <h1 className="font-display font-extrabold text-3xl text-stone-900 dark:text-stone-100 tracking-tight">
          Prepare for your next remote interview
        </h1>
        <p className="text-stone-500 dark:text-stone-400 mt-2 max-w-xl mx-auto">
          Get role-specific questions, model answer structures, and the mistakes to avoid — generated in seconds.
        </p>
      </div>

      <div className="card p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Job role</label>
            <input type="text" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" className="input" maxLength={120} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Level</label>
            <select value={level} onChange={e => setLevel(e.target.value as any)} className="input">
              <option value="entry">Entry</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
              <option value="executive">Executive</option>
            </select>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">Focus areas <span className="font-normal text-stone-400">(optional)</span></label>
          <input type="text" value={focus} onChange={e => setFocus(e.target.value)} placeholder="e.g. system design, leadership, ecommerce, fintech" className="input" maxLength={300} />
        </div>
        <button onClick={generate} disabled={loading || role.trim().length < 3}
          className="flex items-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-500 text-white font-bold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {loading
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Brain className="w-4 h-4" />}
          {loading ? 'Generating…' : 'Generate Interview Prep'}
        </button>
        {!isLoggedIn() && (
          <p className="mt-3 text-xs text-stone-400 dark:text-stone-500 flex items-center gap-1">
            <LogIn className="w-3 h-3" /> You&apos;ll need to sign in to generate prep.
          </p>
        )}
      </div>

      {prep && (
        <div className="space-y-5">
          <Section icon={<MessageCircle className="w-4 h-4" />} title="Behavioural questions" questions={prep.behavioral_questions} />
          <Section icon={<Brain className="w-4 h-4" />} title="Technical / role-specific" questions={prep.technical_or_role_questions} />
          <Section icon={<Sparkles className="w-4 h-4" />} title="Remote-work specific" questions={prep.remote_specific_questions} />

          <div className="card p-5">
            <h2 className="font-bold text-sm flex items-center gap-2 text-stone-900 dark:text-stone-100 mb-3"><CheckCircle className="w-4 h-4 text-brand-600" /> Smart questions to ask them</h2>
            <ul className="space-y-2">
              {prep.questions_to_ask_them.map((q, i) => (
                <li key={i} className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed pl-4 relative">
                  <span className="absolute left-0 text-brand-600">·</span>{q}
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5 border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10">
            <h2 className="font-bold text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-3"><AlertCircle className="w-4 h-4" /> Red flags to avoid</h2>
            <ul className="space-y-2">
              {prep.red_flags_to_avoid.map((q, i) => (
                <li key={i} className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed pl-4 relative">
                  <span className="absolute left-0 text-amber-600">·</span>{q}
                </li>
              ))}
            </ul>
          </div>

          <div className="text-center pt-4">
            <Link href="/jobs" className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors">
              <Shield className="w-4 h-4" /> Browse jobs that match
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, questions }: { icon: React.ReactNode; title: string; questions: PrepQ[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-100 dark:border-[#1e3a5f] bg-stone-50 dark:bg-[#0f1e38] flex items-center gap-2">
        <span className="text-brand-600">{icon}</span>
        <h2 className="font-bold text-sm text-stone-900 dark:text-stone-100">{title}</h2>
      </div>
      <div className="divide-y divide-stone-100 dark:divide-[#1e3a5f]">
        {questions.map((q, i) => (
          <details key={i} className="group">
            <summary className="px-5 py-3 cursor-pointer text-sm font-semibold text-stone-900 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors">
              {q.q}
            </summary>
            <div className="px-5 pb-4 space-y-2 text-xs">
              <p><span className="font-bold text-stone-500 uppercase tracking-wider">What it tests:</span> <span className="text-stone-600 dark:text-stone-300">{q.what_it_tests}</span></p>
              <p><span className="font-bold text-brand-700 uppercase tracking-wider">Answer structure:</span> <span className="text-stone-600 dark:text-stone-300">{q.structure}</span></p>
              <p><span className="font-bold text-amber-700 uppercase tracking-wider">Common mistake:</span> <span className="text-stone-600 dark:text-stone-300">{q.common_mistake}</span></p>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
