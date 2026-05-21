// app/api/og/route.tsx — Dynamic OG images for social sharing
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title   = searchParams.get('title')   ?? 'Find Your Remote Job';
  const company = searchParams.get('company') ?? '';
  const salary  = searchParams.get('salary')  ?? '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          backgroundColor: '#0a5c36', padding: '60px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Logo row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
          <div style={{ width: '40px', height: '40px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '20px', color: 'white' }}>R</div>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '22px', fontWeight: 700 }}>RemoteJobs44</span>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {company && (
            <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.7)', marginBottom: '16px' }}>{company}</div>
          )}
          <div style={{ fontSize: title.length > 40 ? '42px' : '52px', color: 'white', fontWeight: 800, lineHeight: 1.1, marginBottom: '20px', maxWidth: '900px' }}>
            {title}
          </div>
          {salary && (
            <div style={{ fontSize: '28px', color: '#7FE5B0', fontWeight: 700 }}>{salary}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '24px' }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '18px' }}>🌍 50,000+ remote jobs worldwide</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '18px' }}>remotejobs44.vercel.app</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
