import { ReactNode } from 'react';

interface T { quote: ReactNode; img: string; name: string; role: string; }

const TESTIMONIALS: T[] = [
  {
    quote: <>I&apos;d been applying for months on boards full of roles that secretly wanted me on-site. Here every listing is <b>genuinely remote</b> — I had two interviews in my first week.</>,
    img: '/redesign/people-4-portrait.jpg',
    name: 'Adaeze O.',
    role: 'Frontend Engineer · Remote → Vercel',
  },
  {
    quote: <>The salary ranges are <b>shown upfront</b> in dollars. No guessing, no wasted applications. I negotiated $40k more than my last role.</>,
    img: '/redesign/ad-blazer-man.jpg',
    name: 'Kwame A.',
    role: 'Product Designer · Remote → Figma',
  },
  {
    quote: <>The $3 day pass paid for itself instantly — one unlock, one apply link, <b>one offer letter</b>. Best three dollars I&apos;ve ever spent.</>,
    img: '/redesign/ad-coffee-woman.jpg',
    name: 'Thandiwe M.',
    role: 'Data Analyst · Remote → Andela',
  },
];

export function Testimonials() {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="section-head">
          <span className="section-kicker">Hired through RemoteJobs44</span>
          <h2>Real offers. Real paychecks. From home.</h2>
          <p>5,000+ professionals across 60+ countries landed remote roles they found here.</p>
        </div>
        <div className="tcard-grid">
          {TESTIMONIALS.map(t => (
            <figure className="tcard" key={t.name}>
              <div className="quote-mark">&ldquo;</div>
              <blockquote>{t.quote}</blockquote>
              <figcaption className="tcard-person">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.img} alt={t.name} />
                <div>
                  <div className="pn">{t.name}</div>
                  <div className="pr">{t.role}</div>
                </div>
                <div className="stars" aria-label="5 out of 5">★★★★★</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
