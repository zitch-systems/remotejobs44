// components/seo/FaqJsonLd.tsx
//
// Emits a FAQPage <script> tag. Google sometimes surfaces FAQs as an
// accordion under the SERP result; Perplexity / ChatGPT / Claude Search
// pull them as direct-answer fodder. Pairs with the visible FAQ block
// in <FaqList />.
//
// SpeakableSpecification: signals to Google Assistant / voice search
// that the answer text is voice-friendly. Limited rollout but free to
// add — the assistant prefers FAQ content that explicitly opts in, and
// no penalty for emitting it on pages that don't get spoken.

interface Faq { q: string; a: string }

export function FaqJsonLd({ items }: { items: Faq[] }) {
  if (items.length === 0) return null;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type':    'FAQPage',
    speakable: {
      '@type': 'SpeakableSpecification',
      // Match by xpath rather than cssSelector so we're not coupled to a
      // specific class name (different call sites style their FAQ block
      // differently — /faq, slice landing pages, salary guides). The
      // article-level xpath catches any FAQ rendered inside a <section>
      // following an <h2>.
      xpath: ['/html/head/title', '//section//h3', '//section//p'],
    },
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
