// app/api/scrape/route.ts — Career page scraper for bulk import (GET + POST)
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'edge';
export const revalidate = 300;

const ATS_PATTERNS: Record<string, string> = {
  'greenhouse.io':       'Greenhouse',
  'lever.co':            'Lever',
  'ashbyhq.com':         'Ashby',
  'workable.com':        'Workable',
  'bamboohr.com':        'BambooHR',
  'myworkdayjobs.com':   'Workday',
  'icims.com':           'iCIMS',
  'taleo.net':           'Taleo',
  'smartrecruiters.com': 'SmartRecruiters',
  'rippling.com':        'Rippling',
  'recruitee.com':       'Recruitee',
  'personio.de':         'Personio',
  'breezy.hr':           'Breezy HR',
  'jobvite.com':         'Jobvite',
};

function detectATS(url: string): string {
  const lower = url.toLowerCase();
  for (const [pattern, name] of Object.entries(ATS_PATTERNS)) {
    if (lower.includes(pattern)) return name;
  }
  return 'Custom';
}

function extractCompanyName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    // boards.greenhouse.io/company → company
    if (hostname.includes('greenhouse.io') || hostname.includes('lever.co')) {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      if (parts.length > 0) return parts[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return hostname.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Unknown';
  }
}
