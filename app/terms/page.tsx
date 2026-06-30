import type { Metadata } from 'next';
import { LegalDoc, type LegalSection } from '@/components/legal/LegalDoc';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description:
    'The terms and conditions that govern your use of RemoteJobs44 — accounts, subscriptions and payments, acceptable use, third-party listings, liability and more.',
  alternates: { canonical: '/terms' },
};

const UPDATED = 'June 2026';

const SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    heading: 'Agreement to these terms',
    body: (
      <>
        <p>
          These Terms &amp; Conditions (the &ldquo;Terms&rdquo;) are a binding agreement between you
          and RemoteJobs44 (&ldquo;RemoteJobs44&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; or
          &ldquo;our&rdquo;) governing your access to and use of the website at{' '}
          <a href="https://remotejobs44.com">remotejobs44.com</a>{' '}and all related services (the
          &ldquo;Service&rdquo;).
        </p>
        <p>
          By accessing or using the Service — or by creating an account — you confirm that you have
          read, understood and agree to be bound by these Terms and by our{' '}
          <a href="/privacy">Privacy Policy</a>. If you do not agree, please do not use the Service.
          You must be at least 18 years old to use the Service.
        </p>
      </>
    ),
  },
  {
    id: 'definitions',
    heading: 'Definitions',
    body: (
      <ul>
        <li>
          <strong>&ldquo;Account&rdquo;</strong> — the personal account you register to access
          certain features.
        </li>
        <li>
          <strong>&ldquo;Listing&rdquo;</strong> — a job advertisement displayed on the Service,
          which may originate from an employer, a partner or a third-party job source.
        </li>
        <li>
          <strong>&ldquo;Paid Plan&rdquo;</strong> — a Day Pass or a Pro subscription that unlocks
          additional features such as apply links.
        </li>
        <li>
          <strong>&ldquo;Content&rdquo;</strong> — any text, data, files or other material available
          on or submitted to the Service.
        </li>
      </ul>
    ),
  },
  {
    id: 'the-service',
    heading: 'The Service',
    body: (
      <>
        <p>
          RemoteJobs44 is a job-discovery platform. We aggregate and present remote job Listings and
          provide tools to search, filter, save and apply to them. Browsing and searching are free.
        </p>
        <p>
          We are <strong>not</strong> an employer, a recruiter or an agent of any employer, and we do
          not participate in hiring decisions. We do not guarantee the accuracy, availability or
          legitimacy of any Listing, or that using the Service will result in interviews or
          employment. Any dealings you have with an employer are solely between you and that employer.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    heading: 'Your account',
    body: (
      <>
        <p>
          To use certain features you must create an Account. You agree to provide accurate and
          complete information and to keep it up to date. You are responsible for:
        </p>
        <ul>
          <li>maintaining the confidentiality of your login credentials;</li>
          <li>all activity that happens under your Account; and</li>
          <li>
            notifying us promptly at <a href="mailto:hello@remotejobs44.com">hello@remotejobs44.com</a>{' '}
            if you suspect any unauthorised use.
          </li>
        </ul>
        <p>You may not share your Account or use anyone else&rsquo;s without permission.</p>
      </>
    ),
  },
  {
    id: 'subscriptions',
    heading: 'Subscriptions, plans & payments',
    body: (
      <>
        <p>
          The Service offers a free tier and Paid Plans (such as a Day Pass and Pro Monthly / Pro
          Annual subscriptions). Plan features and prices are shown on our{' '}
          <a href="/pricing">Pricing page</a>{' '}and may change from time to time.
        </p>
        <ul>
          <li>
            <strong>Payment processing.</strong> Payments are processed securely by Paystack. By
            purchasing a Paid Plan, you authorise us (through Paystack) to charge the applicable fees
            to your chosen payment method.
          </li>
          <li>
            <strong>Auto-renewal.</strong> Subscription plans renew automatically at the end of each
            billing period at the then-current price, unless you cancel before the renewal date.
          </li>
          <li>
            <strong>A Day Pass</strong> grants time-limited access and does not auto-renew.
          </li>
          <li>
            <strong>Price changes.</strong> We may change prices on a going-forward basis; changes do
            not affect the period you have already paid for, and we will give reasonable notice of
            changes that affect renewals.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'cancellations-refunds',
    heading: 'Cancellations & refunds',
    body: (
      <p>
        You can cancel a subscription at any time from your account settings; cancellation stops the
        next renewal, and you keep access until the end of the period you have already paid for.
        Except where required by law, fees already paid are non-refundable and partial periods are not
        refunded. If you believe you were charged in error, contact us at{' '}
        <a href="mailto:hello@remotejobs44.com">hello@remotejobs44.com</a>{' '}and we will review it in
        good faith.
      </p>
    ),
  },
  {
    id: 'acceptable-use',
    heading: 'Acceptable use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>use the Service for any unlawful, fraudulent or harmful purpose;</li>
          <li>
            scrape, harvest, copy or systematically extract Listings or other data, or use bots,
            crawlers or automated means, except as expressly permitted by us;
          </li>
          <li>
            resell, sublicense or commercially exploit the Service or its content without our written
            permission;
          </li>
          <li>
            attempt to gain unauthorised access to, interfere with, or disrupt the Service, its
            servers or its security;
          </li>
          <li>upload malware, post spam, or impersonate any person or entity; or</li>
          <li>infringe the intellectual property or other rights of RemoteJobs44 or any third party.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'your-content',
    heading: 'Content you submit',
    body: (
      <p>
        You retain ownership of the Content you submit (such as your CV/résumé and profile details).
        You grant RemoteJobs44 a worldwide, non-exclusive, royalty-free licence to host, store and use
        that Content solely to operate and provide the Service to you (for example, to display your CV
        when you apply). You are responsible for ensuring your Content is accurate and that you have
        the right to share it.
      </p>
    ),
  },
  {
    id: 'third-party-listings',
    heading: 'Third-party listings & links',
    body: (
      <p>
        Listings and apply links frequently lead to external employer or job-board websites that we do
        not control. We are not responsible for those Listings, their content, their hiring practices,
        or the third-party sites. <strong>Never pay money to apply for a job</strong> and treat any
        request for fees, banking details or sensitive documents with caution — please verify the
        employer independently and report anything suspicious to{' '}
        <a href="mailto:hello@remotejobs44.com">hello@remotejobs44.com</a>.
      </p>
    ),
  },
  {
    id: 'intellectual-property',
    heading: 'Intellectual property',
    body: (
      <p>
        The Service, including its design, software, logos, text and the compilation of Listings, is
        owned by RemoteJobs44 or its licensors and is protected by intellectual-property laws. We grant
        you a limited, personal, non-transferable and revocable licence to use the Service for its
        intended purpose. All rights not expressly granted are reserved.
      </p>
    ),
  },
  {
    id: 'disclaimers',
    heading: 'Disclaimers',
    body: (
      <p>
        The Service is provided on an <strong>&ldquo;as is&rdquo;</strong> and{' '}
        <strong>&ldquo;as available&rdquo;</strong> basis without warranties of any kind, whether
        express or implied, including any implied warranties of merchantability, fitness for a
        particular purpose, non-infringement, or that the Service will be uninterrupted, error-free or
        secure. We make no warranty that any Listing is accurate, current or genuine, or that you will
        obtain employment through the Service.
      </p>
    ),
  },
  {
    id: 'limitation-of-liability',
    heading: 'Limitation of liability',
    body: (
      <p>
        To the maximum extent permitted by law, RemoteJobs44 and its officers, employees and partners
        will not be liable for any indirect, incidental, special, consequential or punitive damages, or
        for any loss of profits, data, goodwill or opportunities, arising out of or related to your use
        of (or inability to use) the Service. To the extent we are found liable, our total aggregate
        liability will not exceed the greater of the amount you paid us in the 12 months before the
        event giving rise to the claim, or NGN 10,000. Nothing in these Terms excludes liability that
        cannot be excluded under applicable law.
      </p>
    ),
  },
  {
    id: 'indemnification',
    heading: 'Indemnification',
    body: (
      <p>
        You agree to indemnify and hold RemoteJobs44 harmless from any claims, damages, losses and
        reasonable expenses (including legal fees) arising out of your misuse of the Service, your
        Content, or your breach of these Terms or of any law or third-party right.
      </p>
    ),
  },
  {
    id: 'termination',
    heading: 'Suspension & termination',
    body: (
      <p>
        You may stop using the Service and delete your Account at any time. We may suspend or terminate
        your access — with or without notice — if you breach these Terms, if we are required to by law,
        or to protect the Service or other users. On termination, the licences granted to you end,
        while any terms that by their nature should survive (such as intellectual property, disclaimers,
        limitation of liability and governing law) will continue to apply.
      </p>
    ),
  },
  {
    id: 'changes',
    heading: 'Changes to the Service & these terms',
    body: (
      <p>
        We may modify or discontinue parts of the Service, and we may update these Terms from time to
        time. When changes are material we will revise the &ldquo;Last updated&rdquo; date above and,
        where appropriate, notify you in the Service or by email. Your continued use of the Service
        after changes take effect means you accept the updated Terms.
      </p>
    ),
  },
  {
    id: 'governing-law',
    heading: 'Governing law & disputes',
    body: (
      <p>
        These Terms are governed by the laws of the Federal Republic of Nigeria, without regard to its
        conflict-of-laws rules. You and RemoteJobs44 agree to first try to resolve any dispute
        informally by contacting{' '}
        <a href="mailto:hello@remotejobs44.com">hello@remotejobs44.com</a>. Any dispute that cannot be
        resolved informally will be subject to the courts of Nigeria, except where applicable local law
        gives you the right to bring proceedings elsewhere.
      </p>
    ),
  },
  {
    id: 'miscellaneous',
    heading: 'Miscellaneous',
    body: (
      <ul>
        <li>
          <strong>Entire agreement.</strong> These Terms and our Privacy Policy are the entire
          agreement between you and us regarding the Service.
        </li>
        <li>
          <strong>Severability.</strong> If any provision is found unenforceable, the rest remain in
          full effect.
        </li>
        <li>
          <strong>No waiver.</strong> Our failure to enforce a provision is not a waiver of it.
        </li>
        <li>
          <strong>Assignment.</strong> You may not assign these Terms without our consent; we may
          assign them in connection with a merger, acquisition or sale of assets.
        </li>
      </ul>
    ),
  },
  {
    id: 'contact',
    heading: 'Contact us',
    body: (
      <p>
        Questions about these Terms? Email us at{' '}
        <a href="mailto:hello@remotejobs44.com">hello@remotejobs44.com</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms & Conditions"
      subtitle="Please read these terms carefully — they govern your access to and use of RemoteJobs44, including accounts, paid plans and the job listings we display."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
