'use client';
// app/admin/vc-boards/page.tsx — VC board directory (Consider removed)
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ExternalLink, Search, CheckCircle, Zap, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VC_BOARDS, PLATFORM_META, INGESTION_STATUS_META, TOTAL_APPROX_JOBS, type VCBoard, type IngestionStatus } from '@/lib/vc-boards';

export default function VCBoardsPage() {
  const [q, setQ] = useState('');
  const [filterStatus, setFilterStatus] = useState<IngestionStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = VC_BOARDS.filter(b => {
    const matchQ = !q || b.name.toLowerCase().includes(q.toLowerCase()) || b.focus?.toLowerCase().includes(q.toLowerCase());
    const matchStatus = filterStatus === 'all' || b.ingestionStatus === filterStatus;
    return matchQ && matchStatus;
  });

  const stats = {
    total: VC_BOARDS.length,
    freeApi: VC_BOARDS.filter(b => b.ingestionStatus === 'free-api').length,
    jsOnly: VC_BOARDS.filter(b => b.ingestionStatus === 'js-only').length,
    totalJobs: TOTAL_APPROX_JOBS,
  };

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100 tracking-tight">VC Job Board Directory</h1>
          <span className="px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 text-xs font-bold">
            {stats.total} boards · ~{(stats.totalJobs / 1000).toFixed(0)}k jobs
          </span>
        </div>
        <p className="text-sm text-stone-400 dark:text-stone-500">VC portfolio job boards with platform detection and ingestion status.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-4 text-center cursor-pointer hover:border-green-400 transition-colors" onClick={() => setFilterStatus('free-api')}>
          <div className="text-2xl font-display font-extrabold text-green-600 dark:text-green-400">{stats.freeApi}</div>
          <div className="text-xs font-semibold text-stone-400 dark:text-stone-500 mt-0.5">✅ Free API</div>
        </div>
        <div className="card p-4 text-center cursor-pointer hover:border-amber-400 transition-colors" onClick={() => setFilterStatus('js-only')}>
          <div className="text-2xl font-display font-extrabold text-amber-600 dark:text-amber-400">{stats.jsOnly}</div>
          <div className="text-xs font-semibold text-stone-400 dark:text-stone-500 mt-0.5">⚡ JS only</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-display font-extrabold text-brand-700 dark:text-brand-400">~{(stats.totalJobs/1000).toFixed(0)}k</div>
          <div className="text-xs font-semibold text-stone-400 dark:text-stone-500 mt-0.5">Total jobs</div>
        </div>
      </div>

      <div className="card p-3 mb-4 border-blue-200 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-900/10 flex items-center gap-3">
        <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-400">
          Most VC portfolio boards (HV Capital, Insight Partners, Antler, EQT, etc.) use <strong>Getro</strong> — a JS-rendered paid platform. 
          Add individual portfolio company Greenhouse/Lever/Ashby URLs via <Link href="/admin/sources" className="underline font-semibold">Sources</Link> or use <Link href="/admin/company-import" className="underline font-semibold">Bulk Import</Link>.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-lg focus-within:border-brand-600 transition-colors">
          <Search className="w-4 h-4 text-stone-400 shrink-0" />
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search boards…" className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="input text-sm sm:w-44">
          <option value="all">All boards</option>
          <option value="free-api">✅ Free API</option>
          <option value="js-only">⚡ JS only</option>
        </select>
      </div>

      <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">{filtered.length} of {VC_BOARDS.length} boards</p>

      <div className="space-y-2">
        {filtered.map(board => {
          const pm = PLATFORM_META[board.platform];
          const im = INGESTION_STATUS_META[board.ingestionStatus];
          const isExpanded = expandedId === board.id;
          return (
            <div key={board.id} className="card overflow-hidden">
              <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-stone-50 dark:hover:bg-[#162033] transition-colors" onClick={() => setExpandedId(isExpanded ? null : board.id)}>
                <div className={cn('w-2 h-2 rounded-full shrink-0', { 'bg-green-500': board.ingestionStatus === 'free-api', 'bg-amber-400': board.ingestionStatus === 'js-only', 'bg-blue-500': board.ingestionStatus === 'rss' })} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">{board.name}</span>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold', pm?.color ?? '')}>{pm?.label}</span>
                    <span className={cn('text-xs font-semibold', im?.color)}>{im?.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500">
                    <span>📍 {board.hq}</span>
                    {board.focus && <span>🎯 {board.focus}</span>}
                    {board.approxJobs && <span>~{(board.approxJobs / 1000).toFixed(1)}k jobs</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={board.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-[#1e3a5f] transition-colors"><ExternalLink className="w-3.5 h-3.5" /></a>
                  {board.ingestionStatus === 'free-api' && (
                    <button onClick={e => { e.stopPropagation(); }} className="px-3 py-1.5 text-xs font-bold bg-brand-700 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors">Import</button>
                  )}
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-stone-100 dark:border-[#1e3a5f] px-4 py-4 bg-stone-50 dark:bg-[#162033] animate-fade-in text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">Platform</p>
                      <div className="text-stone-600 dark:text-stone-300 space-y-1">
                        <div>{pm?.label} — {pm?.apiNote}</div>
                        {board.apiEndpoint && <div className="font-mono text-xs bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded px-2 py-1 mt-1 break-all">{board.apiEndpoint}</div>}
                        {board.notes && <div className="text-stone-400 dark:text-stone-500 mt-1">{board.notes}</div>}
                      </div>
                    </div>
                    <div>
                      <p className="font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">Ingestion strategy</p>
                      <div className="text-stone-600 dark:text-stone-300">
                        {board.ingestionStatus === 'free-api' && <span className="text-green-700 dark:text-green-400">✅ Fully automated — click Import to pull jobs now.</span>}
                        {board.ingestionStatus === 'js-only' && (
                          <div className="space-y-1">
                            <div className="text-amber-700 dark:text-amber-400">⚡ JS-rendered — no free API available.</div>
                            <div className="text-stone-400">Add individual portfolio company Greenhouse/Lever/Ashby URLs via Bulk Import.</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <a href={board.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-stone-200 dark:border-[#1e3a5f] rounded-lg text-stone-500 hover:bg-white dark:hover:bg-[#0d1a2e] transition-colors"><ExternalLink className="w-3.5 h-3.5" /> Visit board</a>
                    <Link href="/admin/company-import" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-brand-600 dark:border-brand-500 rounded-lg text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">Bulk Import →</Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 card p-5 bg-stone-50 dark:bg-[#0D1F18]">
        <p className="font-bold text-sm text-stone-700 dark:text-stone-300 mb-3">Ingestion Summary</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div><p className="font-semibold text-green-700 dark:text-green-400 mb-1">✅ Works now (free)</p><p className="text-stone-500 dark:text-stone-400">YC / workatastartup — 1,400+ hiring companies, ~15k jobs, via yc-oss.github.io public API.</p></div>
          <div><p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">⚡ Use Bulk Import instead</p><p className="text-stone-500 dark:text-stone-400">HV Capital, Insight Partners, Antler, Atomico, EQT + others on Getro. Add individual Greenhouse/Lever URLs via Bulk Import.</p></div>
        </div>
      </div>
    </div>
  );
}
