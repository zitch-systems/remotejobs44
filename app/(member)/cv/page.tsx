'use client';
// app/(member)/cv/page.tsx — CV Builder
// ATS-ready résumé editor with a live preview and an ATS score ring.
// State persists to localStorage (rj44-cv-draft); swap the save handler for
// a POST to /api/cv when a structured-CV endpoint exists.
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { useUIStore } from '@/lib/store';
import { useMemberGate } from '@/lib/member/use-member-gate';
import { MemberLoading } from '@/components/member/MemberLoading';

interface Experience {
  title: string;
  company: string;
  start: string;
  end: string;
  desc: string;
}
interface CvData {
  name: string;
  headline: string;
  email: string;
  location: string;
  linkedin: string;
  portfolio: string;
  summary: string;
  experience: Experience[];
  skills: string;
}

const DEFAULT_CV: CvData = {
  name: 'Ada Obi',
  headline: 'Senior Frontend Engineer',
  email: 'ada.obi@gmail.com',
  location: 'Lagos, Nigeria (Remote)',
  linkedin: 'linkedin.com/in/adaobi',
  portfolio: 'github.com/adaobi',
  summary:
    'Frontend engineer with 6+ years building high-performance web apps. Passionate about great UX, accessible design, and remote-first collaboration.',
  experience: [
    {
      title: 'Senior Frontend Engineer',
      company: 'Andela',
      start: 'Jan 2021',
      end: 'Present',
      desc: 'Led frontend architecture for a remote-first SaaS product. Built a React component library used across 4 products.',
    },
    {
      title: 'Frontend Developer',
      company: 'Flutterwave',
      start: 'Mar 2019',
      end: 'Dec 2020',
      desc: 'Built payment UI components handling 2M+ monthly transactions. Reduced page load time by 40%.',
    },
  ],
  skills: 'React, TypeScript, Next.js, GraphQL, Node.js, Figma, Git',
};

const STORAGE_KEY = 'rj44-cv-draft';

/** Heuristic ATS score from completeness — stands in for a real ATS engine. */
function scoreCv(cv: CvData): number {
  let s = 0;
  if (cv.name.trim()) s += 8;
  if (cv.headline.trim()) s += 10;
  if (cv.email.trim()) s += 6;
  if (cv.location.trim()) s += 6;
  if (cv.linkedin.trim() || cv.portfolio.trim()) s += 8;
  if (cv.summary.trim().length > 40) s += 18;
  const filledExp = cv.experience.filter((e) => e.title.trim() && e.company.trim());
  s += Math.min(filledExp.length, 3) * 8;
  filledExp.forEach((e) => { if (e.desc.trim().length > 30) s += 4; });
  const skillCount = cv.skills.split(',').map((x) => x.trim()).filter(Boolean).length;
  s += Math.min(skillCount, 8) * 2;
  return Math.max(0, Math.min(100, s));
}

function scoreBand(n: number): string {
  if (n >= 85) return 'Excellent';
  if (n >= 70) return 'Good';
  if (n >= 50) return 'Fair';
  return 'Needs work';
}

export default function CvBuilderPage() {
  const { ready } = useMemberGate();
  const { toast } = useUIStore();
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [cv, setCv] = useState<CvData>(DEFAULT_CV);

  // Load any saved draft once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCv({ ...DEFAULT_CV, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  const score = useMemo(() => scoreCv(cv), [cv]);
  const skills = useMemo(
    () => cv.skills.split(',').map((s) => s.trim()).filter(Boolean),
    [cv.skills],
  );

  if (!ready) return <MemberLoading />;

  const set = <K extends keyof CvData>(k: K, v: CvData[K]) => setCv((c) => ({ ...c, [k]: v }));
  const setExp = (i: number, patch: Partial<Experience>) =>
    setCv((c) => ({ ...c, experience: c.experience.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) }));
  const addExp = () =>
    setCv((c) => ({ ...c, experience: [...c.experience, { title: '', company: '', start: '', end: '', desc: '' }] }));
  const removeExp = (i: number) =>
    setCv((c) => ({ ...c, experience: c.experience.filter((_, idx) => idx !== i) }));

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cv));
      toast('CV draft saved', 'success');
    } catch {
      toast('Could not save draft', 'error');
    }
  }

  function download() {
    setTab('preview');
    setTimeout(() => window.print(), 80);
  }

  // r=14 circle → circumference 2πr ≈ 87.96
  const CIRC = 87.96;
  const dashOffset = CIRC * (1 - score / 100);

  const ResumePreview = (
    <div className="resume-card">
      <div className="rc-name">{cv.name || 'Your name'}</div>
      <div className="rc-title">{cv.headline || 'Your headline'}</div>
      <div className="rc-contact">
        {cv.email && <span>{cv.email}</span>}
        {cv.location && <span>{cv.location}</span>}
        {cv.linkedin && <span>{cv.linkedin}</span>}
        {cv.portfolio && <span>{cv.portfolio}</span>}
      </div>
      {cv.summary.trim() && (
        <div className="rc-sec">
          <h4>Summary</h4>
          <p className="rc-summary">{cv.summary}</p>
        </div>
      )}
      {cv.experience.some((e) => e.title || e.company) && (
        <div className="rc-sec">
          <h4>Experience</h4>
          {cv.experience
            .filter((e) => e.title || e.company)
            .map((e, i) => (
              <div className="rc-item" key={i}>
                <div className="ri-head">
                  <span className="ri-t">{e.title || 'Role'}</span>
                  <span className="ri-d">{[e.start, e.end].filter(Boolean).join(' – ')}</span>
                </div>
                <div className="ri-co">{e.company}{e.company ? ' · Remote' : ''}</div>
                {e.desc && <div className="ri-desc">{e.desc}</div>}
              </div>
            ))}
        </div>
      )}
      {skills.length > 0 && (
        <div className="rc-sec">
          <h4>Skills</h4>
          <div className="skill-pills">
            {skills.map((s) => <span className="skill-pill" key={s}>{s}</span>)}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="tool">
      <div className="tool-topbar">
        <h1>CV Builder</h1>
        <div className="cv-tabs" role="tablist" aria-label="CV view">
          <button className={`cv-tab${tab === 'edit' ? ' on' : ''}`} onClick={() => setTab('edit')} role="tab" aria-selected={tab === 'edit'}>Edit</button>
          <button className={`cv-tab${tab === 'preview' ? ' on' : ''}`} onClick={() => setTab('preview')} role="tab" aria-selected={tab === 'preview'}>Preview</button>
          <button className="cv-tab" onClick={download}>Download</button>
        </div>
        <div className="cv-score">
          <div className="score-ring" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--border-2)" strokeWidth="4" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--brand-500)" strokeWidth="4" strokeDasharray={CIRC} strokeDashoffset={dashOffset} strokeLinecap="round" />
            </svg>
            <div className="sn">{score}</div>
          </div>
          ATS Score · {scoreBand(score)}
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 4 }} onClick={save}>Save CV</button>
        </div>
      </div>

      <div className="cv-body tool-two">
        {tab === 'edit' && (
          <div className="editor">
            <div className="esec">
              <div className="esec-h"><span className="n">1</span><h3>Contact</h3></div>
              <div className="frow">
                <div className="field"><label>Full name</label><input value={cv.name} onChange={(e) => set('name', e.target.value)} /></div>
                <div className="field"><label>Title / Headline</label><input value={cv.headline} onChange={(e) => set('headline', e.target.value)} /></div>
                <div className="field"><label>Email</label><input value={cv.email} onChange={(e) => set('email', e.target.value)} /></div>
                <div className="field"><label>Location</label><input value={cv.location} onChange={(e) => set('location', e.target.value)} /></div>
                <div className="field"><label>LinkedIn</label><input value={cv.linkedin} onChange={(e) => set('linkedin', e.target.value)} /></div>
                <div className="field"><label>GitHub / Portfolio</label><input value={cv.portfolio} onChange={(e) => set('portfolio', e.target.value)} /></div>
              </div>
            </div>

            <div className="esec">
              <div className="esec-h"><span className="n">2</span><h3>Summary</h3></div>
              <div className="frow"><div className="field full"><label>Professional summary</label><textarea value={cv.summary} onChange={(e) => set('summary', e.target.value)} /></div></div>
            </div>

            <div className="esec">
              <div className="esec-h"><span className="n">3</span><h3>Experience</h3></div>
              {cv.experience.map((e, i) => (
                <div className="frow" key={i} style={{ marginBottom: i < cv.experience.length - 1 ? 18 : 0 }}>
                  <div className="field"><label>Job title</label><input value={e.title} onChange={(ev) => setExp(i, { title: ev.target.value })} /></div>
                  <div className="field"><label>Company</label><input value={e.company} onChange={(ev) => setExp(i, { company: ev.target.value })} /></div>
                  <div className="field"><label>Start date</label><input value={e.start} onChange={(ev) => setExp(i, { start: ev.target.value })} /></div>
                  <div className="field"><label>End date</label><input value={e.end} onChange={(ev) => setExp(i, { end: ev.target.value })} /></div>
                  <div className="field full"><label>Description</label><textarea value={e.desc} onChange={(ev) => setExp(i, { desc: ev.target.value })} /></div>
                  {cv.experience.length > 1 && (
                    <div className="field full">
                      <button className="btn btn-ghost btn-sm" onClick={() => removeExp(i)} style={{ alignSelf: 'flex-start' }}>
                        <Trash2 style={{ width: 14, height: 14 }} /> Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button className="add-btn" style={{ marginTop: 10 }} onClick={addExp}>
                <Plus /> Add experience
              </button>
            </div>

            <div className="esec">
              <div className="esec-h"><span className="n">4</span><h3>Skills</h3></div>
              <div className="frow"><div className="field full"><label>Skills (comma separated)</label><input value={cv.skills} onChange={(e) => set('skills', e.target.value)} /></div></div>
            </div>
          </div>
        )}

        <div className="preview" style={tab === 'preview' ? { gridColumn: '1 / -1' } : undefined}>
          {ResumePreview}
          {score >= 85 && (
            <p style={{ textAlign: 'center', color: 'var(--success)', fontSize: 13, fontWeight: 600, marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}>
              <Check style={{ width: 15, height: 15 }} /> ATS-ready — clean single-column layout
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
