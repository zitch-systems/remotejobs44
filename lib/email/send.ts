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

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email not sent');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     FROM_EMAIL,
        to:       [opts.to],
        subject:  opts.subject,
        html:     opts.html,
        reply_to: opts.replyTo,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Resend error:', res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email send failed:', err);
    return false;
  }
}
