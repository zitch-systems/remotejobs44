import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send';
import { contactMessageEmail } from '@/lib/email/templates';
import { rateLimit, getIP } from '@/lib/rate-limit';
import { logError } from '@/lib/log';

export async function POST(req: NextRequest) {
  const ip = getIP(req);
  const rl = rateLimit(`contact:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.success) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: `Too many requests. Try again in ${retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email and message are required.' }, { status: 400 });
    }

    // Cap the email at 254 chars (RFC 5321 SMTP envelope limit). A 2 MB
    // "email" address would pass the regex below and only fail upstream
    // at Resend — keep the bad-input rejection cheap here.
    const safeEmail   = String(email).replace(/[\r\n\t]/g, '').trim().slice(0, 254);
    const safeName    = String(name).replace(/[\r\n]/g, '').trim().slice(0, 100);
    const safeSubject = String(subject ?? '').replace(/[\r\n]/g, '').trim().slice(0, 200);
    const safeMessage = String(message).slice(0, 2000);

    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(safeEmail)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    if (safeMessage.length > 2000) {
      return NextResponse.json({ error: 'Message is too long (max 2000 characters).' }, { status: 400 });
    }

    // contactMessageEmail() HTML-escapes every field before interpolating it
    // into the body — these values are public and submitter-controlled, so
    // name='<img src=x onerror=...>' would otherwise reach the owner's inbox
    // as active HTML. Most clients block <script>, but tracking pixels and
    // link spoofing still work. It also builds the subject as a header value
    // (tags and control characters stripped, not entity-escaped).
    const { subject: subjectLine, html } = contactMessageEmail({
      name:    safeName,
      email:   safeEmail,
      subject: safeSubject,
      message: safeMessage,
    });

    const sent = await sendEmail({
      to: process.env.CONTACT_EMAIL ?? 'hello@remotejobs44.com',
      subject: subjectLine,
      html,
      replyTo: safeEmail,
    });

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 });
    }

    // SECURITY: do NOT auto-reply to the submitter-supplied `safeEmail`.
    // The contact form is public and that address is unverified/attacker-
    // controlled, so sending a confirmation to it turned this endpoint into
    // a spam / email-bomb relay — an attacker could make us email arbitrary
    // victims (the per-IP cap is bypassable across IPs). The owner gets the
    // message above and replies via the Reply-To header; the on-page success
    // state is the user's confirmation.
    return NextResponse.json({ success: true });
  } catch (err: any) {
    logError({ event: 'contact.unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
