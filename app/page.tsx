// app/page.tsx — Deep Ocean landing (Direction B), wired to real jobs.
import type { Metadata } from 'next';
import { fetchLandingJobs } from '@/components/home/deep-ocean/data';
import { Hero }            from '@/components/home/deep-ocean/Hero';
import { CompanyMarquee }  from '@/components/home/deep-ocean/CompanyMarquee';
import { Differentiator }  from '@/components/home/deep-ocean/Differentiator';
import { Listings }        from '@/components/home/deep-ocean/Listings';
import { Categories }      from '@/components/home/deep-ocean/Categories';
import { Featured }        from '@/components/home/deep-ocean/Featured';
import { LiveWall }        from '@/components/home/deep-ocean/LiveWall';
import { Mission }         from '@/components/home/deep-ocean/Mission';
import { HowItWorks }      from '@/components/home/deep-ocean/HowItWorks';
import { Capabilities }    from '@/components/home/deep-ocean/Capabilities';
import { Testimonials }    from '@/components/home/deep-ocean/Testimonials';
import { Faq }             from '@/components/home/deep-ocean/Faq';
import { CtaBand }         from '@/components/home/deep-ocean/CtaBand';

export const metadata: Metadata = {
  title: 'RemoteJobs44 – Global Remote Jobs',
  description:
    'Search over 70,000+ remote jobs from top companies worldwide. Engineering, design, marketing, finance and more.',
};

// Re-fetch hourly — the landing's live feel comes from the CSS animations,
// not minute-by-minute data freshness.
export const revalidate = 3600;

export default async function HomePage() {
  const jobs = await fetchLandingJobs(40);

  return (
    <div className="deep-ocean">
      <Hero jobs={jobs} />
      <CompanyMarquee />
      <Differentiator />
      <Listings jobs={jobs} />
      <Categories />
      <Featured jobs={jobs} />
      <LiveWall jobs={jobs} />
      <Mission />
      <HowItWorks />
      <Capabilities />
      <Testimonials />
      <Faq />
      <CtaBand />
    </div>
  );
}
