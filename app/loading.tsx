// app/loading.tsx — global route-level loading UI. Shows the branded logo
// loader during navigations/streaming for any route without its own loading.tsx.
import { BrandLoaderScreen } from '@/components/ui/BrandLoader';

export default function Loading() {
  return <BrandLoaderScreen label="Loading…" />;
}
