// lib/email/send.ts — Email sending via Resend API
// Get free API key at resend.com (100 emails/day free)

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const FROM_EMAIL     = process.env.RESEND_FROM_EMAIL ?? 'RemoteJobs44 <hello@remotejobs44.com>';

interface SendEmailOptions {
  to:       string;
  subject:  string;
  html:     string;
  replyTo?: string;
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email not sent to', to);
    return false;
  }

  try {
    const body: Record<string, unknown> = { from: FROM_EMAIL, to, subject, html };
    if (replyTo) body.reply_to = replyTo;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email send failed:', err);
    return false;
  }