'use client';

import { useEffect } from 'react';
import Link from 'next/link';

const APP_RETURN_URL = 'remotejobs44://paystack-return';

export default function PaymentReturn() {
  useEffect(() => {
    // Keep the button visible if the browser blocks automatic app opening.
    const timer = window.setTimeout(() => window.location.assign(APP_RETURN_URL), 200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center px-5 py-12 text-center">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">Return to RemoteJobs44</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-300">
          Open the app to check your payment and refresh your access. Your payment is confirmed only after verification.
        </p>
        <a href={APP_RETURN_URL} className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
          Open RemoteJobs44 app
        </a>
        <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          If the app does not open, close this browser and return to Plans in the app. You can retry verification without starting another payment.
        </p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-blue-600 underline underline-offset-4 dark:text-blue-400">
          Go to RemoteJobs44 website
        </Link>
      </div>
    </section>
  );
}
