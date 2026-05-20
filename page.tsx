// app/page.tsx — RemoteJobs44 homepage
// Only imports components guaranteed to exist in this repo
import type { Metadata } from 'next';
import { HeroSection }    from '@/components/home/HeroSection';
import { HowItWorks }     from '@/components/home/HowItWorks';
import { PricingPreview } from '@/components/home/PricingPreview';
import { CTASection }     from '@/components/home/CTASection';

export const metadata: Metadata = {
  title: 'RemoteJobs44 – Global Remote Jobs',
  description:
    'Find 50,000+ remote jobs from top companies worldwide. Engineering, design, marketing, finance and more. Subscribe from ₦1,000.',
};

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <HowItWorks />
      <PricingPreview />
      <CTASection />
    </>
  );
}
