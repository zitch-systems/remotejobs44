'use client';
import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  target: number;
  suffix?: string;
  className?: string;
  durationMs?: number;
  // Re-run the 0 → target count on a loop "to show the effect". When false
  // (default) it counts once on scroll-into-view, as before.
  loop?: boolean;
  // Pause held at the top before the next recount (loop only).
  holdMs?: number;
}

// Animates 0 → target when scrolled into view (IntersectionObserver),
// ease-out over ~1.2s. With `loop`, it keeps recounting (count → hold →
// reset → count …). Respects prefers-reduced-motion (renders the final
// value, no motion).
export function CountUp({ target, suffix = '', className, durationMs = 1200, loop = false, holdMs = 2600 }: CountUpProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(target);
      return;
    }

    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const runOnce = (then?: () => void) => {
      const start = performance.now();
      // Targets are small (e.g. 70, 150, 10) so many animation frames round to
      // the same integer. Only commit state when the displayed value actually
      // changes — skips a stream of no-op re-renders and lowers INP.
      let last = -1;
      const tick = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const v = Math.round(eased * target);
        if (v !== last) {
          last = v;
          setValue(v);
        }
        if (t < 1) raf = requestAnimationFrame(tick);
        else then?.();
      };
      raf = requestAnimationFrame(tick);
    };

    const cycle = () => {
      runOnce(() => {
        if (!loop || cancelled) return;
        timer = setTimeout(() => {
          if (cancelled) return;
          setValue(0);
          cycle();
        }, holdMs);
      });
    };

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started.current) {
            started.current = true;
            cycle();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [target, durationMs, loop, holdMs]);

  return (
    <div ref={ref} className={className}>
      {value}{suffix}
    </div>
  );
}
