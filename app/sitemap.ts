// app/sitemap.ts — Dynamic sitemap for SEO
import { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.vercel.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const static_pages = [
    { url: BASE,                     priority: 1.0,  changeFrequency: 'daily'   as const },
    { url: `${BASE}/jobs`,           priority: 0.9,  changeFrequency: 'hourly'  as const },
    { url: `${BASE}/pricing`,        priority: 0.8,  changeFrequency: 'weekly'  as const },
    { url: `${BASE}/login`,          priority: 0.6,  changeFrequency: 'monthly' as const },
    { url: `${BASE}/register`,       priority: 0.7,  changeFrequency: 'monthly' as const },
    { url: `${BASE}/contact`,        priority: 0.4,  changeFrequency: 'monthly' as const },
    { url: `${BASE}/privacy`,        priority: 0.3,  changeFrequency: 'monthly' as const },
    { url: `${BASE}/terms`,          priority: 0.3,  changeFrequency: 'monthly' as const },
  ].map(p => ({ ...p, lastModified: new Date() }));

  // Category pages
  const categories = ['engineering','design','marketing','finance','sales','data','hr','product','legal','operations'];
  const category_pages = categories.map(cat => ({
    url: `${BASE}/jobs?category=${cat}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }));

  return [...static_pages, ...category_pages];
}
