// lib/member/alerts.ts
// Seed notifications for the member Alerts screen + a tiny read-state seam
// (localStorage) shared by the Alerts page, the top-bar bell badge and the
// sidebar "Alerts" badge so they all agree on the unread count.
//
// Swap SEED_ALERTS for a real `/api/notifications` fetch when the backend
// notification feed lands — the component only depends on the MemberAlert
// shape and the read-state helpers below.

export type AlertKind = 'job' | 'application' | 'system';
export type AlertIcon = 'search' | 'video' | 'check' | 'chart' | 'file';

export interface MemberAlert {
  id: string;
  kind: AlertKind;
  group: string;
  title: string;
  desc: string;
  time: string;
  actionLabel?: string;
  actionHref?: string;
  iconBg: string;
  iconColor: string;
  icon: AlertIcon;
  /** Whether this alert starts unread (before the user marks it read). */
  unread: boolean;
}

export const SEED_ALERTS: MemberAlert[] = [
  {
    id: 'a1', kind: 'job', group: 'Today', unread: true,
    title: '12 new Engineering roles match your saved search',
    desc: 'Senior / Lead · Remote Worldwide · posted in the last 24h. Vercel, Linear and Notion among the new listings.',
    time: '2 hours ago', actionLabel: 'Browse now →', actionHref: '/jobs?category=engineering',
    iconBg: '#eff6ff', iconColor: '#2563eb', icon: 'search',
  },
  {
    id: 'a2', kind: 'application', group: 'Today', unread: true,
    title: 'Interview reminder: Vercel · Tech screen in 1 hour',
    desc: 'Your technical screen for Senior Frontend Engineer at Vercel starts at 4:00 PM. Prepare with a quick AI mock session.',
    time: '3 hours ago', actionLabel: 'Practice now →', actionHref: '/interview',
    iconBg: '#fff7ed', iconColor: '#ea580c', icon: 'video',
  },
  {
    id: 'a3', kind: 'application', group: 'Today', unread: true,
    title: 'Offer received from Shopify 🎉',
    desc: 'Congratulations! Shopify has sent you an offer for Full-Stack Engineer. Review your offer and respond by Friday.',
    time: '5 hours ago', actionLabel: 'View offer →', actionHref: '/applications',
    iconBg: '#f0fdf4', iconColor: '#16a34a', icon: 'check',
  },
  {
    id: 'a4', kind: 'job', group: 'Yesterday', unread: false,
    title: '8 new Design roles added overnight',
    desc: 'Figma, Airbnb and 6 others listed new Product Design and Design Engineering roles matching your profile.',
    time: 'Yesterday 7:00 AM', actionLabel: 'View roles →', actionHref: '/jobs?category=design',
    iconBg: '#eff6ff', iconColor: '#2563eb', icon: 'search',
  },
  {
    id: 'a5', kind: 'system', group: 'Yesterday', unread: false,
    title: 'Your CV score improved to 78%',
    desc: 'Adding your TypeScript experience pushed your ATS score up from 72%. Add a summary section to reach 90%+.',
    time: 'Yesterday 10:30 AM', actionLabel: 'Improve CV →', actionHref: '/cv',
    iconBg: '#fdf2f8', iconColor: '#db2777', icon: 'chart',
  },
  {
    id: 'a6', kind: 'application', group: 'Yesterday', unread: false,
    title: 'Andela moved your application to final round',
    desc: 'Your application for Growth Marketing Lead at Andela has progressed to the final interview round. Scheduled for Monday.',
    time: 'Yesterday 2:00 PM', actionLabel: 'View application →', actionHref: '/applications',
    iconBg: '#fef2f2', iconColor: '#dc2626', icon: 'file',
  },
];

const READ_KEY = 'rj44-alerts-read';
export const ALERTS_CHANGED_EVENT = 'rj44-alerts-changed';

/** Ids the user has marked read (persisted across the member shell). */
export function getReadIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function setReadIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(new Set(ids))));
    window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

/** An alert is unread when it starts unread AND the user hasn't read it. */
export function isUnread(a: MemberAlert, readIds: string[]): boolean {
  return a.unread && !readIds.includes(a.id);
}

/** Total unread count given the persisted read set. */
export function getUnreadCount(readIds = getReadIds()): number {
  return SEED_ALERTS.filter((a) => isUnread(a, readIds)).length;
}
