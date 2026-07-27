'use client';
// app/(member)/alerts/page.tsx — Alerts / notification centre
// Grouped by day, filterable by kind, with mark-all-read. Read state is
// shared with the top-bar bell + sidebar badge via lib/member/alerts.ts
// (localStorage + a change event). Swap SEED_ALERTS for a real feed later.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Video, CheckCircle2, BarChart3, FileText, Bell } from 'lucide-react';
import {
  SEED_ALERTS, getReadIds, setReadIds, isUnread,
  type MemberAlert, type AlertIcon,
} from '@/lib/member/alerts';
import { useMemberGate } from '@/lib/member/use-member-gate';
import { MemberLoading } from '@/components/member/MemberLoading';
import { JobAlertManager } from '@/components/member/JobAlertManager';

type Tab = 'all' | 'jobs' | 'apps' | 'system';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'jobs', label: 'Job Alerts' },
  { key: 'apps', label: 'Applications' },
  { key: 'system', label: 'System' },
];

const ICONS: Record<AlertIcon, typeof Search> = {
  search: Search, video: Video, check: CheckCircle2, chart: BarChart3, file: FileText,
};

function inTab(a: MemberAlert, tab: Tab) {
  if (tab === 'all') return true;
  if (tab === 'jobs') return a.kind === 'job';
  if (tab === 'apps') return a.kind === 'application';
  return a.kind === 'system';
}

export default function AlertsPage() {
  const { ready } = useMemberGate();
  const [tab, setTab] = useState<Tab>('all');
  const [readIds, setRead] = useState<string[]>([]);

  useEffect(() => { setRead(getReadIds()); }, []);

  const unreadByTab = useMemo(() => {
    const count = (t: Tab) => SEED_ALERTS.filter((a) => inTab(a, t) && isUnread(a, readIds)).length;
    return { all: count('all'), jobs: count('jobs'), apps: count('apps'), system: count('system') } as Record<Tab, number>;
  }, [readIds]);

  if (!ready) return <MemberLoading />;

  const visible = SEED_ALERTS.filter((a) => inTab(a, tab));
  const groups = Array.from(new Set(visible.map((a) => a.group)));

  function markAllRead() {
    setReadIds(SEED_ALERTS.map((a) => a.id));
    setRead(SEED_ALERTS.map((a) => a.id));
  }
  function markOne(id: string) {
    const next = Array.from(new Set([...readIds, id]));
    setReadIds(next);
    setRead(next);
  }

  return (
    <div className="tool">
      <div className="tool-topbar">
        <h1>Alerts</h1>
        <button className="btn btn-ghost btn-sm" onClick={markAllRead} disabled={unreadByTab.all === 0}>
          Mark all as read
        </button>
      </div>

      <JobAlertManager />

      <div className="al-tabs" role="tablist" aria-label="Alert filters">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`al-tab${tab === key ? ' on' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
            {unreadByTab[key] > 0 && <span className="tc">{unreadByTab[key]}</span>}
          </button>
        ))}
      </div>

      <div className="al-list">
        {visible.length === 0 && <div className="al-empty">No alerts in this category.</div>}
        {groups.map((group) => (
          <div key={group}>
            <div className="al-group-label">{group}</div>
            {visible.filter((a) => a.group === group).map((a) => {
              const unread = isUnread(a, readIds);
              const Icon = ICONS[a.icon];
              return (
                <div
                  key={a.id}
                  className={`al-card${unread ? ' unread' : ''}`}
                  onClick={() => unread && markOne(a.id)}
                  style={{ cursor: unread ? 'pointer' : 'default' }}
                >
                  <div className="al-ic" style={{ background: a.iconBg, color: a.iconColor }}>
                    <Icon />
                  </div>
                  <div className="al-text">
                    <div className="al-title">{a.title}</div>
                    <div className="al-desc">{a.desc}</div>
                    <div className="al-meta">
                      <span className="al-time">{a.time}</span>
                      {a.actionLabel && a.actionHref && (
                        <Link className="al-action" href={a.actionHref} onClick={(e) => e.stopPropagation()}>
                          {a.actionLabel}
                        </Link>
                      )}
                    </div>
                  </div>
                  {unread && <div className="unread-dot" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
