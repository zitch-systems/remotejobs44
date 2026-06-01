import type { Metadata } from 'next';

// /interview-prep is a client component, so metadata lives in this server
// layout (it was previously inheriting only the generic root title).
export const metadata: Metadata = {
  title: 'AI Interview Prep',
  description: 'Practice for your remote job interview with AI-generated questions tailored to the role and company.',
  alternates: { canonical: 'https://remotejobs44.com/interview-prep' },
};

export default function InterviewPrepLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
