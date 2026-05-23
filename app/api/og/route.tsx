import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title   = searchParams.get('title')    ?? 'Find Remote Jobs';
  const company = searchParams.get('company')  ?? '';
  const salary  = searchParams.get('salary')   ?? '';
  const sub     = searchParams.get('subtitle') ?? '50,000+ remote jobs • remotejobs44.com';

  return new ImageResponse(
    (
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        width: '100%', height: '100%', padding: '60px 72px',
        background: 'linear-gradient(135deg, #0a1628 0%, #0f2040 60%, #0d2d5e 100%)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {/* Logo row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 900, color: '#fff',
          }}>R</div>
          <span style={{ color: '#93c5fd', fontSize: 22, fontWeight: 700 }}>RemoteJobs44</span>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {company && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              color: '#60a5fa', fontSize: 22, fontWeight: 600,
            }}>
              📍 {company} · Remote
            </div>
          )}
          <div style={{
            color: '#f1f5f9', fontSize: title.length > 40 ? 44 : 54,
            fontWeight: 900, lineHeight: 1.1, letterSpacing: '-1px',
          }}>
            {title}
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {salary && (
              <div style={{
                background: '#1d4ed8', color: '#bfdbfe', padding: '8px 20px',
                borderRadius: 999, fontSize: 18, fontWeight: 700,
              }}>
                💰 {salary}
              </div>
            )}
            <div style={{
              background: '#0f2040', border: '1px solid #1e3a5f',
              color: '#94a3b8', padding: '8px 20px', borderRadius: 999, fontSize: 18,
            }}>
              🌍 Remote · Worldwide
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ color: '#475569', fontSize: 18 }}>
          {sub}
        