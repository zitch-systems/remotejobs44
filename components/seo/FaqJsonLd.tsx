// components/seo/FaqJsonLd.tsx
//
// Emits a FAQPage <script> tag. Google sometimes surfaces FAQs as an
// accordion under the SERP result; Perplexity / ChatGPT / Claude Search
// pull them as direct-answer fodder. Pairs with the visible FAQ block
// in <FaqList />.

interface Faq { q: string; a: string }

export function FaqJsonLd({ items }: { items: Faq[] }) {
  if (items.length === 0) return null;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type':    'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name:    item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text:    item.a,
      },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />
  );
}
