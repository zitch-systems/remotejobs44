'use client';
// app/admin/broadcasts/page.tsx
//
// Admin composer for one-off broadcast emails. Pairs with
// /api/admin/broadcasts which handles the actual fan-out and audit
// row.
//
// Flow:
//   1. admin types subject + HTML body
//   2. picks audience: plan filter (all/free/daily/pro) + confirmed-
//      only toggle (default on)
//   3. "Send test to me" sends one copy to the admin's own address
//      so they can sanity-check rendering before the real fan-out
//   4. "Send to <N> users" runs the real send. Confirms in the
//      browser; the server enforces a 5k-recipient cap
//
// The body is plain HTML — no markdown parser pulled in. We surface
// a quick preview iframe with the same string so the admin sees what
// they're shipping.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Send, Mail, Eye, Loader2, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const TEMPLATES: Array<{ id: string; name: string; subject: string; body: string }> = [
  {
    id:      'blank',
    name:    'Blank',
    subject: '',
    body:    '<p>Hi there,</p>\n<p></p>\n<p>—</p>\n<p>The RemoteJobs44 Team</p>',
  },
  {
    id:      'product_update',
    name:    'Product update',
    subject: 'New on RemoteJobs44 — a few updates worth knowing',
    body:    '<h2 style="margin:0 0 16px;font-size:20px;color:#1e293b">What\'s new this week</h2>\n<p>Hi {{NAME}},</p>\n<ul>\n  <li>Update one</li>\n  <li>Update two</li>\n</ul>\n<p>Browse the latest: <a href="https://remotejobs44.com/jobs" style="color:#1d4ed8;font-weight:600">remotejobs44.com/jobs</a></p>',
  },
  {
    id:      'plan_nudge',
    name:    'Pro plan nudge',
    subject: 'Unlock direct apply links for ₦1,000',
    body:    '<h2 style="margin:0 0 16px;font-size:20px;color:#1e293b">Pro unlocks the actual apply links</h2>\n<p>Hi {{NAME}},</p>\n<p>Pro is ₦1,000/month and unlocks the full apply URL on every listing, auto-apply, application tracking, and unlimited AI CV review.</p>\n<p><a href="https://remotejobs44.com/pricing" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">See plans →</a></p>',
  },
];

type Plan = 'all' | 'free' | 'daily' | 'pro';

export default function BroadcastComposerPage() {
  const supabase = createClient();
  const { toast } = useUIStore();

  const [subject, setSubject] = useState('');
  const [body,    setBody]    = useState('');
  const [plan,    setPlan]    = useState<Plan>('all');
  const [onlyConfirmed, setOnlyConfirmed] = useState(true);
  const [templateId, setTemplateId] = useState('blank');
  const [adminEmail, setAdminEmail] = useState('');
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  const [sendingTest, setSendingTest] = useState(false);
  const [sendingReal, setSendingReal] = useState(false);
  const [lastResult,  setLastResult]  = useState<{ sent: number; failed: number; audience: number } | null>(null);

  // Resolve the admin's own email up front so the "send test to me"
  // button has somewhere to send. Pulls from the live session, not
  // Zustand, so a typo in the persisted name doesn't matter.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setAdminEmail(user.email);
    })();
  }, []);

  // Audience preview — refetch whenever the filter changes. We don't
  // actually need a dedicated count endpoint; the broadcasts POST
  // already counts before sending, and the audience filter is small
  // enough to ask the existing /api/admin/stats route for the
  // totals. Reuse it.
  const refreshAudience = useMemo(() => async () => {
    setAudienceLoading(true);
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' });
      const data = await res.json();
      const totals: Record<Plan, number> = {
        all:   Number(data.activeUsers ?? 0),
        free:  Math.max(0, Number(data.activeUsers ?? 0) - Number(data.pro ?? 0) - Number(data.daily ?? 0)),
        daily: Number(data.daily ?? 0),
        pro:   Number(data.pro ?? 0),
      };
      setAudienceCount(totals[plan] ?? 0);
    } catch {
      setAudienceCount(null);
    } finally {
      setAudienceLoading(false);
    }
  }, [plan]);

  useEffect(() => { refreshAudience(); }, [refreshAudience]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = TEMPLATES.find(x => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
  }

  async function handleTest() {
    if (sendingTest || sendingReal) return;
    if (!subject.trim() || !body.trim()) { toast('Subject and body required', 'error'); return; }
    if (!adminEmail) { toast('No admin email resolved — refresh the page.', 'error'); return; }
    setSendingTest(true);
    try {
      const res = await fetch('/api/admin/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html: body, plan, onlyConfirmed, testTo: adminEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Test send failed');
      toast(`Test email sent to ${data.sentTo}`, 'success', 5000);
    } catch (err: any) {
      toast(err?.message ?? 'Test send failed', 'error', 5000);
    } finally {
      setSendingTest(false);
    }
  }

  async function handleSend() {
    if (sendingReal || sendingTest) return;
    if (!subject.trim() || !body.trim()) { toast('Subject and body required', 'error'); return; }
    const audienceLabel = audienceCount === null ? 'all matching users' : `${audienceCount} user${audienceCount === 1 ? '' : 's'}`;
    if (!confirm(`Send this broadcast to ${audienceLabel}?\n\nThis cannot be undone. You can run a test send to yourself first.`)) return;

    setSendingReal(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/admin/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html: body, plan, onlyConfirmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Broadcast failed');
      if (data.reason === 'no_recipients') {
        toast('No recipients matched the filter.', 'info', 5000);
        setLastResult({ sent: 0, failed: 0, audience: 0 });
      } else {
        setLastResult({ sent: data.sent ?? 0, failed: data.failed ?? 0, audience: data.audience_count ?? 0 });
        toast(`Sent to ${data.sent} of ${data.audience_count}${data.failed ? ` (${data.failed} failed)` : ''}`,
          data.failed ? 'error' : 'success', 6000);
      }
    } catch (err: any) {
      toast(err?.message ?? 'Broadcast failed', 'error', 6000);
    } finally {
      setSendingReal(false);
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
            <Mail className="w-5 h-5 text-brand-700 dark:text-brand-400" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">Broadcast Email</h1>
            <p className="text-sm text-stone-400 mt-0.5">Send a one-off email to a slice of registered users.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Composer column */}
        <div className="space-y-5">
          <div className="card p-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Template</label>
            <select value={templateId} onChange={e => applyTemplate(e.target.value)}
              className="input text-sm w-full">
              {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <p className="text-[10px] text-stone-400 mt-1">Placeholder <code className="px-1 bg-stone-100 dark:bg-stone-800 rounded">{'{{NAME}}'}</code> is currently left literal — no per-row personalisation yet.</p>
          </div>

          <div className="card p-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="Email subject" maxLength={200}
              className="input text-sm w-full" />
            <p className="text-[10px] text-stone-400 mt-1 text-right">{subject.length}/200</p>
          </div>

          <div className="card p-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">HTML body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="<p>Hi there,</p>"
              rows={12} maxLength={50_000}
              className="input text-sm w-full font-mono resize-y min-h-[180px]" />
            <p className="text-[10px] text-stone-400 mt-1 text-right">{body.length}/50,000</p>
          </div>

          <div className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Audience</p>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {(['all', 'free', 'daily', 'pro'] as Plan[]).map(p => (
                <button key={p} onClick={() => setPlan(p)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold transition-colors',
                    plan === p
                      ? 'bg-brand-700 text-white dark:bg-brand-500'
                      : 'bg-stone-100 dark:bg-[#162033] text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#1e3a5f]'
                  )}>
                  {p === 'all' ? 'All users' : p === 'daily' ? 'Day Pass' : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300 cursor-pointer mb-2">
              <input type="checkbox" checked={onlyConfirmed} onChange={e => setOnlyConfirmed(e.target.checked)}
                className="w-4 h-4 rounded border-stone-300 dark:border-[#1e3a5f] text-brand-700 focus:ring-brand-600 cursor-pointer" />
              Only confirmed emails
            </label>
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500">
                {audienceLoading
                  ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Counting…</span>
                  : audienceCount === null
                    ? 'Audience size unknown'
                    : <>≈ <strong className="text-stone-900 dark:text-stone-100">{audienceCount.toLocaleString()}</strong> recipient{audienceCount === 1 ? '' : 's'} (before confirmed-only filter)</>}
              </span>
              <button onClick={refreshAudience}
                className="text-brand-700 dark:text-brand-400 hover:underline flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
          </div>

          <div className="card p-4 flex flex-col gap-2">
            <button onClick={handleTest} disabled={sendingTest || sendingReal || !adminEmail}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-400 text-sm font-bold hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-60 transition-colors">
              {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send test to {adminEmail || 'me'}
            </button>
            <button onClick={handleSend} disabled={sendingTest || sendingReal}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold hover:bg-brand-600 disabled:opacity-60 transition-colors">
              {sendingReal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send broadcast
            </button>
            {lastResult && (
              <div className={cn(
                'mt-2 p-3 rounded-md text-xs flex items-start gap-2',
                lastResult.failed > 0
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                  : 'bg-brand-50 dark:bg-brand-900/20 text-brand-800 dark:text-brand-300',
              )}>
                {lastResult.failed > 0 ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5" /> : <CheckCircle className="w-3.5 h-3.5 mt-0.5" />}
                <span>
                  Sent <strong>{lastResult.sent}</strong> of <strong>{lastResult.audience}</strong>
                  {lastResult.failed > 0 && <>, <strong>{lastResult.failed}</strong> failed</>}.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Preview column */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-700 dark:text-stone-300">
            <Eye className="w-4 h-4 text-stone-400" /> Preview
          </div>
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-stone-100 dark:border-[#1e3a5f] bg-stone-50 dark:bg-[#162033]">
              <p className="text-[10px] uppercase tracking-wider text-stone-400">Subject</p>
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{subject || '— empty —'}</p>
            </div>
            <iframe
              title="broadcast preview"
              srcDoc={`<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#1c1917;background:#fff;line-height:1.6;">${body || '<p style="color:#94a3b8">Preview will render here as you type.</p>'}</body></html>`}
              sandbox=""
              className="w-full bg-white"
              style={{ minHeight: 500, border: 'none' }}
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-stone-400 text-center mt-6">
        <Link href="/admin" className="hover:underline">← Back to admin overview</Link>
      </p>
    </div>
  );
}
