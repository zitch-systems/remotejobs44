'use client';
// components/jobs/ApplyRedirectModal.tsx
//
// Brief "you're leaving RemoteJobs44" confirmation before redirecting
// the user to an external recruiter site. The audit flagged the
// absence of this as a trust gap — the displayed domain lets a user
// spot a mismatch between the listed employer and the apply-link
// target (e.g. listing claims Stripe, apply URL goes to
// evil-tracker.com).
//
// safeWindowOpen has already filtered out `javascript:` / `data:`
// schemes upstream; this modal is about transparency, not safety.
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { modalService } from '@/components/ui/Modal';
import { safeWindowOpen } from '@/lib/safe-url';

function hostnameOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'the company site'; }
}

export function ApplyRedirectModal({
  applyUrl,
  company,
}: {
  applyUrl: string;
  company: string;
}) {
  const host = hostnameOf(applyUrl);
  const isMailto = applyUrl.startsWith('mailto:');

  function confirmRedirect() {
    safeWindowOpen(applyUrl);
    modalService.close();
  }

  return (
    <div className="p-6 max-w-md">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center text-brand-700 dark:text-brand-400 shrink-0">
          <ExternalLink className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 mb-1">
            {isMailto ? 'Open your email client?' : `You're leaving RemoteJobs44`}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
            {isMailto
              ? <>This opens a new message to <span className="font-semibold text-stone-700 dark:text-stone-300">{company}</span>&rsquo;s recruiting team.</>
              : <>You&rsquo;re about to apply for this role at <span className="font-semibold text-stone-700 dark:text-stone-300">{company}</span>&rsquo;s site.</>
            }
          </p>
        </div>
      </div>

      {!isMailto && (
        <div className="mb-5 p-3 rounded-lg bg-stone-50 dark:bg-[#162033] border border-stone-200 dark:border-[#1e3a5f]">
          <p className="text-xs text-stone-400 dark:text-stone-500 mb-1 uppercase tracking-wider font-bold">Destination</p>
          <p className="font-mono text-sm text-stone-700 dark:text-stone-200 truncate">{host}</p>
        </div>
      )}

      <div className="flex items-start gap-2 mb-5 text-xs text-stone-400 dark:text-stone-500">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          If the destination doesn&rsquo;t match the employer name, please{' '}
          <a href="mailto:hello@remotejobs44.com" className="text-brand-700 dark:text-brand-400 hover:underline">
            tell us
          </a>{' '}
          — we&rsquo;ll review the listing.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => modalService.close()}
          className="flex-1 py-2.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 text-sm font-semibold rounded-lg hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors"
        >
          Stay here
        </button>
        <button
          onClick={confirmRedirect}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-brand-700 dark:bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition-colors"
        >
          Continue <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
