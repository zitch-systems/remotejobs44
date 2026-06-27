'use client';
import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  target: number;
  suffix?: string;
  className?: string;
  durationMs?: number;
}

// Animates 0 → target when scrolled into view (IntersectionObserver),
// ease-out over ~1.2s. Respects prefers-reduced-motion (renders final value).
export function CountUp({ target, suffix = '', className, durationMs = 1200 }: CountUpProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(target);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && !done.current) {
            done.current = true;
            const start = performance.now();
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / durationMs);
              const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
              setValue(Math.round(eased * target));
              if (t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, durationMs]);

  return (
    <div ref={ref} className={className}>
      {value}{suffix}
    </div>
  );
}
