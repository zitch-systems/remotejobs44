import Link from 'next/link';

export function CtaBand() {
  return (
    <section className="cta-band">
      <div className="wrap cta-inner">
        <span className="eyebrow-pill"><span className="dot" />Join 5,000+ job seekers</span>
        <h2>Your next role is already posted</h2>
        <p>Join 5,000+ professionals who found their next role through RemoteJobs44. Browse free — upgrade only when you&apos;re ready to apply.</p>
        <div className="cta-actions">
          <Link href="/register" className="btn btn-primary btn-lg">Start Searching Free</Link>
          <Link href="/jobs" className="btn btn-lg" style={{ borderColor: 'rgba(255,255,255,0.35)', color: '#fff' }}>Browse Jobs</Link>
        </div>
      </div>
    </section>
  );
}
