import type { Metadata } from 'next';
import { LegalDoc, type LegalSection } from '@/components/legal/LegalDoc';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How RemoteJobs44 collects, uses, shares and protects your personal data — and the rights you have over it under the Nigeria Data Protection Act (NDPR) and the GDPR.',
  alternates: { canonical: '/privacy' },
};

const UPDATED = 'June 2026';

const SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    heading: 'Who we are',
    body: (
      <>
        <p>
          RemoteJobs44 (&ldquo;RemoteJobs44&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; or
          &ldquo;our&rdquo;) operates the website at{' '}
          <a href="https://remotejobs44.com">remotejobs44.com</a>{' '}and related services (together, the
          &ldquo;Service&rdquo;), a job-search platform that helps people find verified remote roles
          in Nigeria and worldwide.
        </p>
        <p>
          For the purposes of applicable data-protection law — including the Nigeria Data Protection
          Act 2023 and the Nigeria Data Protection Regulation (&ldquo;NDPR&rdquo;), and, where it
          applies, the EU/UK General Data Protection Regulation (&ldquo;GDPR&rdquo;) — RemoteJobs44 is
          the <strong>data controller</strong> for the personal data described in this policy. You can
          reach us about any privacy matter at{' '}
          <a href="mailto:hello@remotejobs44.com">hello@remotejobs44.com</a>.
        </p>
      </>
    ),
  },
  {
    id: 'information-we-collect',
    heading: 'Information we collect',
    body: (
      <>
        <p>We collect the following categories of personal data:</p>
        <ul>
          <li>
            <strong>Account data</strong> — your name, email address, password (stored only as a
            salted hash) and, optionally, your country or city.
          </li>
          <li>
            <strong>Profile &amp; application data</strong> — information you choose to add, such as a
            CV/résumé, job preferences, saved searches, saved jobs and application history.
          </li>
          <li>
            <strong>Payment data</strong> — when you buy a Day Pass or a Pro subscription, your card
            and billing details are collected and processed <strong>directly by Paystack</strong>,
            our payment processor. We receive only a transaction reference, the plan purchased and its
            status — we never see or store your full card number.
          </li>
          <li>
            <strong>Usage &amp; device data</strong> — pages viewed, searches run, approximate
            location derived from your IP address, browser and device type, and similar diagnostic
            information, collected through cookies and analytics (see our{' '}
            <a href="/cookies">Cookie Policy</a>).
          </li>
          <li>
            <strong>Communications</strong> — messages you send us by email or through support, and
            your alert/marketing preferences.
          </li>
        </ul>
        <p>
          You do not have to give us personal data, but some features (creating an account, saving
          jobs, unlocking apply links) will not work without it.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use',
    heading: 'How we use your information',
    body: (
      <>
        <p>We use your personal data to:</p>
        <ul>
          <li>create and manage your account and provide the Service;</li>
          <li>show, rank and personalise job listings, searches and alerts;</li>
          <li>take payment for, and give you access to, paid plans;</li>
          <li>
            send you service messages (receipts, security notices, account updates) and — only if you
            opt in — job alerts and marketing emails, which you can unsubscribe from at any time;
          </li>
          <li>keep the Service secure, prevent fraud and abuse, and debug problems;</li>
          <li>measure and improve how the Service performs; and</li>
          <li>comply with our legal and regulatory obligations.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'legal-bases',
    heading: 'Our legal bases',
    body: (
      <>
        <p>Where data-protection law requires a legal basis, we rely on:</p>
        <ul>
          <li>
            <strong>Performance of a contract</strong> — to deliver the Service you sign up for and
            process your payments;
          </li>
          <li>
            <strong>Consent</strong> — for optional marketing emails and non-essential cookies, which
            you can withdraw at any time;
          </li>
          <li>
            <strong>Legitimate interests</strong> — to secure, analyse and improve the Service, where
            those interests are not overridden by your rights; and
          </li>
          <li>
            <strong>Legal obligation</strong> — where we must keep or disclose data to comply with the
            law.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'cookies',
    heading: 'Cookies & analytics',
    body: (
      <p>
        We use essential cookies to keep you signed in and remember your preferences, and analytics
        tools (including privacy-respecting product analytics) to understand how the Service is used.
        You can control non-essential cookies through your browser settings. Full details are in our{' '}
        <a href="/cookies">Cookie Policy</a>.
      </p>
    ),
  },
  {
    id: 'how-we-share',
    heading: 'How we share information',
    body: (
      <>
        <p>
          We <strong>do not sell</strong> your personal data. We share it only as needed to run the
          Service:
        </p>
        <ul>
          <li>
            <strong>Service providers (processors)</strong> acting on our instructions — including
            Supabase (database &amp; authentication), Paystack (payments) and Vercel (hosting and
            performance analytics).
          </li>
          <li>
            <strong>Employers and third-party job sources</strong> — many listings link out to an
            external employer or job board. When you click an apply link or submit an application, the
            information you provide goes to that third party under their own privacy practices.
          </li>
          <li>
            <strong>Legal &amp; safety</strong> — where we reasonably believe disclosure is required
            by law, regulation or legal process, or to protect the rights, property or safety of
            RemoteJobs44, our users or the public.
          </li>
          <li>
            <strong>Business transfers</strong> — if RemoteJobs44 is involved in a merger,
            acquisition or sale of assets, your data may be transferred as part of that transaction,
            subject to this policy.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'retention',
    heading: 'How long we keep it',
    body: (
      <p>
        We keep your personal data for as long as your account is active and for as long afterwards as
        we need it to provide the Service, comply with our legal obligations, resolve disputes and
        enforce our agreements. When data is no longer needed, we delete or anonymise it. You can ask
        us to delete your account and associated data at any time (see{' '}
        <a href="#your-rights">Your rights</a>).
      </p>
    ),
  },
  {
    id: 'security',
    heading: 'How we protect your data',
    body: (
      <p>
        We use technical and organisational measures appropriate to the risk — including encryption in
        transit (HTTPS), hashed passwords, access controls and reputable infrastructure providers — to
        protect your data against loss, misuse and unauthorised access. No method of transmission or
        storage is completely secure, so we cannot guarantee absolute security; if a breach affects
        you, we will notify you and the relevant authority where the law requires.
      </p>
    ),
  },
  {
    id: 'international-transfers',
    heading: 'International data transfers',
    body: (
      <p>
        RemoteJobs44 serves users globally and some of our providers process data outside your
        country (for example, in the EU or the United States). Where personal data is transferred
        across borders, we take steps to ensure it remains protected to a standard consistent with the
        NDPR and, where applicable, the GDPR — including relying on providers that offer appropriate
        safeguards such as standard contractual clauses.
      </p>
    ),
  },
  {
    id: 'your-rights',
    heading: 'Your rights',
    body: (
      <>
        <p>
          Subject to applicable law, you have the right to access, correct, delete, restrict or object
          to the processing of your personal data, to request a portable copy, and to withdraw consent
          where we rely on it. You can:
        </p>
        <ul>
          <li>update most account and profile details directly in your settings;</li>
          <li>unsubscribe from marketing emails using the link in any such email; and</li>
          <li>
            exercise any other right by emailing{' '}
            <a href="mailto:hello@remotejobs44.com">hello@remotejobs44.com</a>{' '}— we will respond within
            the time the law allows.
          </li>
        </ul>
        <p>
          If you are in Nigeria, you also have the right to lodge a complaint with the Nigeria Data
          Protection Commission (NDPC). If you are in the EU/UK, you may complain to your local
          supervisory authority.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    heading: "Children's privacy",
    body: (
      <p>
        The Service is intended for people aged 18 and over and is not directed at children. We do not
        knowingly collect personal data from anyone under 18. If you believe a child has provided us
        with personal data, please contact us and we will delete it.
      </p>
    ),
  },
  {
    id: 'third-party-links',
    heading: 'Third-party links',
    body: (
      <p>
        The Service contains links to employer sites, job boards and other third-party websites. We
        are not responsible for the privacy practices or content of those sites. We encourage you to
        read the privacy policy of any site you visit before providing personal data.
      </p>
    ),
  },
  {
    id: 'changes',
    heading: 'Changes to this policy',
    body: (
      <p>
        We may update this Privacy Policy from time to time. When we make material changes we will
        revise the &ldquo;Last updated&rdquo; date above and, where appropriate, notify you in the
        Service or by email. Your continued use of the Service after an update means you accept the
        revised policy.
      </p>
    ),
  },
  {
    id: 'contact',
    heading: 'Contact us',
    body: (
      <p>
        Questions, requests or complaints about this policy or your personal data? Email us at{' '}
        <a href="mailto:hello@remotejobs44.com">hello@remotejobs44.com</a>{' '}and we will be glad to help.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      subtitle="This policy explains what personal data RemoteJobs44 collects, why we collect it, who we share it with, and the choices and rights you have."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
