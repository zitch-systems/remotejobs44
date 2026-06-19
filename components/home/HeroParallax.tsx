'use client';
// components/home/HeroParallax.tsx — decorative hero layers with scroll parallax.
//
// A small client island so the server-rendered hero text/LCP is untouched. Each
// layer translates at its own rate on scroll for a depth effect. The parallax
// translate is applied to a WRAPPER; the existing float/spin 3D keyframes stay
// on the inner element, so the two transforms don't clobber each other.
// rAF-throttled + passive + disabled under prefers-reduced-motion.
import { useEffect, useRef } from 'react';

const ORBS = [
  { factor: 0.12, anim: 'animate-float-a', style: { width: 340, height: 340, top: -70, left: -50, background: 'radial-gradient(circle at 30% 30%, rgba(37,99,235,0.55), transparent 70%)' } },
  { factor: 0.22, anim: 'animate-float-b', style: { width: 300, height: 300, top: 10, right: -60, background: 'radial-gradient(circle at 30% 30%, rgba(249,115,22,0.42), transparent 70%)' } },
  { factor: 0.07, anim: 'animate-float-a', style: { width: 260, height: 260, bottom: -90, left: '42%', background: 'radial-gradient(circle at 30% 30%, rgba(96,165,250,0.45), transparent 70%)' } },
] as const;

const SHAPES = [
  { factor: 0.28, anim: 'anim-float3d', pos: { top: '15%', left: '6%' },  box: { width: 66, height: 66, borderRadius: 18, background: 'linear-gradient(135deg,#3b82f6,#1e40af)', boxShadow: '0 20px 44px -10px rgba(37,99,235,0.55)' } },
  { factor: 0.18, anim: 'anim-spin3d',  pos: { top: '22%', right: '8%' }, box: { width: 54, height: 54, borderRadius: 15, background: 'linear-gradient(135deg,#fb923c,#ea580c)', boxShadow: '0 20px 44px -10px rgba(249,115,22,0.55)' } },
  { factor: 0.34, anim: 'anim-float3d', pos: { bottom: '14%', left: '13%' }, box: { width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(135deg,#60a5fa,#2563eb)', boxShadow: '0 16px 34px -8px rgba(37,99,235,0.5)', animationDelay: '1.5s' } },
  { factor: 0.24, anim: 'anim-spin3d',  pos: { bottom: '20%', right: '12%' }, box: { width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#93c5fd,#3b82f6)', boxShadow: '0 16px 34px -8px rgba(37,99,235,0.5)', animationDelay: '2s' } },
] as const;

export function HeroParallax() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const el = root.current;
    if (!el) return;
    const layers = Array.from(el.querySelectorAll<HTMLElement>('[data-factor]'));
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      for (const l of layers) {
        const f = parseFloat(l.dataset.factor || '0');
        l.style.transform = `translate3d(0, ${(-y * f).toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={root} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Orbs */}
      {ORBS.map((o, i) => (
        <div key={`orb-${i}`} data-factor={o.factor} className="absolute inset-0 will-change-transform">
          <div className={`hero-orb ${o.anim}`} style={o.style as React.CSSProperties} />
        </div>
      ))}

      {/* 3D shapes (sm+ only) */}
      <div className="hidden sm:block">
        {SHAPES.map((s, i) => (
          <div key={`shape-${i}`} data-factor={s.factor} className="absolute will-change-transform" style={s.pos as React.CSSProperties}>
            <div className={`shape-3d ${s.anim}`} style={{ ...(s.box as React.CSSProperties) }} />
          </div>
        ))}
      </div>
    </div>
  );
}
