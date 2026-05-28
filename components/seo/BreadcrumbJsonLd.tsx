// components/seo/BreadcrumbJsonLd.tsx
//
// Emits a BreadcrumbList <script> tag. Google rewards Breadcrumb schema
// with sitelinks in the search result (the secondary nav row beneath the
// main result link), which is the closest thing to a free conversion
// uplift available in organic search. The audit specifically flagged
// landing pages + the job-detail page as missing this.
//
// Server-rendered so it's in the initial HTML and AI crawlers see it
// without executing JS.

interface Crumb { name: string; href: string }

const BASE = 'https://remotejobs44.com';

export function BreadcrumbJsonLd({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type':   'ListItem',
      position:  i + 1,
      name:      c.name,
      // Absolute URL — Google requires `item` to be absolute or omitted.
      // Relative hrefs from callers get joined onto BASE.
      item:      c.href.startsWith('http') ? c.href : `${BASE}${c.href}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />
  );
}
