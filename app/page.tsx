// app/page.tsx
import type { Metadata } from 'next';
import { HeroSection }       from '@/components/home/HeroSection';
import { CategoriesSection } from '@/components/home/CategoriesSection';
import { FeaturedJobs }      from '@/components/home/FeaturedJobs';
import { HowItWorks }        from '@/components/home/HowItWorks';
import { PricingPreview }    from '@/components/home/PricingPreview';
import { GetTheAppSection }  from '@/components/home/GetTheAppSection';
import { CTASection }        from '@/components/home/CTASection';
import { MobileHelpSocial }  from '@/components/home/MobileHelpSocial';

export const metadata: Metadata = {
  title: 'RemoteJobs44 – Global Remote Jobs',
  description:
    'Search over 70,000+ remote jobs from top companies worldwide. Engineering, design, marketing, finance and more.',
};

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <CategoriesSection />
      <FeaturedJobs />
      <HowItWorks />
      <PricingPreview />
      <GetTheAppSection />
      <CTASection />
      {/* Help + social at the page foot for mobile (desktop has the footer). */}
      <MobileHelpSocial />
    </>
  );
}
