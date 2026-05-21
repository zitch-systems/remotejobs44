// app/robots.ts
import { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/dashboard/', '/profile/', '/applications/'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
