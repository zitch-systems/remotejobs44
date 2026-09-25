// app/page.tsx — Deep Ocean landing (Direction B), wired to real jobs.
import type { Metadata } from 'next';
import ReactDOM from 'react-dom';
import { fetchLandingJobs, fetchCategoryCounts } from '@/components/home/deep-ocean/data';
import { Hero }            from '@/components/home/deep-ocean/Hero';
import { CompanyMarquee }  from '@/components/home/deep-ocean/CompanyMarquee';
import { Differentiator }  from '@/components/home/deep-ocean/Differentiator';
import { Categories, CATEGORY_SLUGS } from '@/components/home/deep-ocean/Categories';
import { Featured }        from '@/components/home/deep-ocean/Featured';
import { LiveWall }        from '@/components/home/deep-ocean/LiveWall';
import { Mission }         from '@/components/home/deep-ocean/Mission';
import { HowItWorks }      from '@/components/home/deep-ocean/HowItWorks';
import { Pricing }         from '@/components/home/deep-ocean/Pricing';
import { Capabilities }    from '@/components/home/deep-ocean/Capabilities';
import { Testimonials }    from '@/components/home/deep-ocean/Testimonials';
import { Faq }             from '@/components/home/deep-ocean/Faq';
import { CtaBand }         from '@/components/home/deep-ocean/CtaBand';
import { LiveFeed }        from '@/components/home/deep-ocean/LiveFeed';

export const metadata: Metadata = {
  title: 'RemoteJobs44 – Global Remote Jobs',
  description:
    'Browse remote jobs from employer boards and external feeds. Review each role’s listed location, source and application details.',
};

// Re-fetch hourly — the landing's live feel comes from the CSS animations,
// not minute-by-minute data freshness.
export const revalidate = 3600;

export default async function HomePage() {
  // The hero's LCP element is the .hero-b CSS background photo. Because it's
  // referenced from a stylesheet the browser can't discover it until the CSS
  // has downloaded + parsed, which pushes LCP out. Preloading it here (homepage
  // only, so other routes don't pay for an image they never show) hoists a
  // <link rel="preload" as="image" fetchpriority="high"> into <head> so the
  // fetch starts in parallel with the CSS. We preload the AVIF — the format the
  // image-set() rule in deep-ocean.css serves to the ~94% of browsers that
  // support it (40KB vs the 96KB JPEG fallback the rest get).
  ReactDOM.preload('/redesign/hero-videocall-sm.avif', { as: 'image', fetchPriority: 'high' });

  const [jobs, categoryCounts] = await Promise.all([
    fetchLandingJobs(40),
    fetchCategoryCounts(CATEGORY_SLUGS),
  ]);

  return (
    <div className="deep-ocean">
      <Hero />
      <CompanyMarquee />
      <Differentiator />
      <Categories counts={categoryCounts} />
      <Featured jobs={jobs} />
      <LiveWall jobs={jobs} />
      <Mission />
      <HowItWorks />
      <Pricing />
      <Capabilities />
      <Testimonials />
      <Faq />
      <CtaBand />
      <LiveFeed jobs={jobs} />
    </div>
  );
}
