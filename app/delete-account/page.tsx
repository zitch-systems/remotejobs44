import type { Metadata } from 'next';
import { LegalDoc, type LegalSection } from '@/components/legal/LegalDoc';

// Public, no-login page that tells people how to delete their account and what
// that removes. Google Play requires such a link in the Data safety form for any
// app that lets people create an account, and it has to work for someone who has
// already uninstalled the app — so it must stay reachable without signing in.
//
// Keep the lists below in step with what deletion actually does:
//   * app/api/profile/delete-account/route.ts (website)
//   * supabase/functions/delete-account/index.ts (Android app)
//   * the ON DELETE rules in supabase/*.sql (paystack_transactions keeps the
//     payment row but drops its user_id).
export const metadata: Metadata = {
  title: 'Delete your account',
  description:
    'How to delete your RemoteJobs44 account from the Android app or the website, what is removed — including your CV and profile photo — and what we keep.',
  alternates: { canonical: '/delete-account' },
};

const UPDATED = 'October 2026';

const SECTIONS: LegalSection[] = [
  {
    id: 'in-the-app',
    heading: 'In the Android app',
    body: (
      <>
        <ol>
          <li>Open the RemoteJobs44 app and sign in.</li>
          <li>
            Go to the <strong>Profile</strong> tab and tap <strong>Settings</strong>.
          </li>
          <li>
            Under <strong>Danger zone</strong>, tap <strong>Delete account</strong>.
          </li>
          <li>
            When asked &ldquo;Delete account?&rdquo;, tap <strong>Delete</strong>.
          </li>
        </ol>
        <p>Your account is deleted straight away and you are signed out.</p>
      </>
    ),
  },
  {
    id: 'on-the-website',
    heading: 'On the website',
    body: (
      <>
        <ol>
          <li>
            Sign in at <a href="https://remotejobs44.com/login">remotejobs44.com</a>.
          </li>
          <li>
            Open your <strong>Profile</strong> and choose <strong>Delete account</strong>, or go
            straight to <a href="/profile/billing#danger">Billing &amp; subscription &rarr; Delete account</a>{' '}
            (you will be asked to sign in first).
          </li>
          <li>
            Type <strong>DELETE</strong> to confirm, then choose <strong>Permanently delete</strong>.
          </li>
        </ol>
        <p>Your account is deleted straight away and you are signed out.</p>
      </>
    ),
  },
  {
    id: 'cannot-sign-in',
    heading: 'If you can’t sign in, or no longer have the app',
    body: (
      <p>
        Email <a href="mailto:hello@remotejobs44.com?subject=Delete%20my%20account">hello@remotejobs44.com</a>{' '}
        from the address you registered with, with the subject &ldquo;Delete my account&rdquo;. We may
        ask you to confirm that the account is yours before we delete it, and we will complete the
        request within the time the law allows.
      </p>
    ),
  },
  {
    id: 'what-is-deleted',
    heading: 'What is deleted',
    body: (
      <>
        <p>Deleting your account permanently removes:</p>
        <ul>
          <li>your sign-in details (email address and password);</li>
          <li>
            your profile — name, headline, bio, links, work experience, skills and job preferences;
          </li>
          <li>
            the CV you uploaded and the text we extracted from it, and your profile photos;
          </li>
          <li>your saved jobs, tracked applications and the notes you added to them;</li>
          <li>your job alerts and in-app notifications;</li>
          <li>the push-notification registrations for your devices;</li>
          <li>the referral records you created; and</li>
          <li>your plan and subscription record.</li>
        </ul>
        <p>This cannot be undone.</p>
      </>
    ),
  },
  {
    id: 'what-we-keep',
    heading: 'What we keep, and why',
    body: (
      <ul>
        <li>
          <strong>Payment records.</strong> We keep a record of each payment — its reference, the plan,
          the amount, the currency and the date — for accounting and to resolve disputes. After you
          delete your account that record is no longer linked to you. Our payment processor, Paystack,
          keeps its own records under its own policy.
        </li>
        <li>
          <strong>Backups.</strong> Copies of our database that our infrastructure provider holds for
          disaster recovery are not edited; they expire on the provider&rsquo;s normal schedule.
        </li>
        <li>
          <strong>Referrals made by others.</strong> If someone referred you, their own referral record
          stays, but it no longer points to you.
        </li>
      </ul>
    ),
  },
  {
    id: 'questions',
    heading: 'Questions',
    body: (
      <p>
        See our <a href="/privacy">Privacy Policy</a> for how we handle your data, or email{' '}
        <a href="mailto:hello@remotejobs44.com">hello@remotejobs44.com</a>.
      </p>
    ),
  },
];

export default function DeleteAccountPage() {
  return (
    <LegalDoc
      title="Delete your account"
      subtitle="How to delete your RemoteJobs44 account — from the Android app or the website — and what happens to your data."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
