// components/seo/ArticleJsonLd.tsx
//
// Emits a BlogPosting JSON-LD <script> tag. Google + AI engines treat
// posts with structured Article schema as more authoritative — the
// audit specifically called out the lack of author/datePublished on
// blog posts as an E-E-A-T gap and the reason Google rarely cites
// thin remotejobs44 posts vs the deeper guides from Remotive / RemoteOK.
//
// Server-rendered (no `'use client'`) so the JSON-LD ships in initial
// HTML where crawlers can read it without executing JS.

interface ArticleJsonLdProps {
  /** Full article URL — usually `${BASE}/blog/${slug}`. */
  url: string;
  /** Headline shown in the rich result. */
  title: string;
  /** One-sentence summary — typically the same as <meta description>. */
  description: string;
  /** ISO 8601 string. */
  datePublished: string;
  /** Optional ISO 8601 string; falls back to datePublished. */
  dateModified?: string;
  /** Human author name. Use a real one — "RemoteJobs44 Editorial" is fine
   *  if it's a team byline, but Google prefers a person where possible. */
  authorName: string;
  /** Optional URL for the author (their /about page, LinkedIn, etc.). */
  authorUrl?: string;
  /** Optional hero / OG image URL. */
  image?: string;
}

const PUBLISHER = {
  '@type': 'Organization',
  name:    'RemoteJobs44',
  url:     'https://remotejobs44.com',
  logo: {
    '@type': 'ImageObject',
    url:     'https://remotejobs44.com/icons/apple-touch-icon.png',
    width:   192,
    height:  192,
  },
};

export function ArticleJsonLd({
  url,
  title,
  description,
  datePublished,
  dateModified,
  authorName,
  authorUrl,
  image,
}: ArticleJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished,
    dateModified: dateModified ?? datePublished,
    author: {
      '@type': 'Person',
      name: authorName,
      ...(authorUrl ? { url: authorUrl } : {}),
    },
    publisher: PUBLISHER,
    ...(image ? { image: [image] } : {}),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />
  );
}
