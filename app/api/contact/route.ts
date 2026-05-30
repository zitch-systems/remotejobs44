import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send';
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

    const safeEmail   = String(email).replace(/[\r\n\t]/g, '').trim();
    const safeName    = String(name).replace(/[\r\n]/g, '').trim().slice(0, 100);
    const safeSubject = String(subject ?? '').replace(/[\r\n]/g, '').trim().slice(0, 200);
    const safeMessage = String(message).slice(0, 2000);

    // HTML-escape before interpolating into the email body. Previously
    // `safeName`/`safeEmail`/`safeSubject` were only stripped of newlines,
    // so an attacker could submit name='<img src=x onerror=...>' and reach
    // the admin's inbox with active HTML. Most mail clients block <script>
    // but tracking pixels and link spoofing still work.
    const htmlEscape = (s: string) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const nameHtml    = htmlEscape(safeName);
    const emailHtml   = htmlEscape(safeEmail);
    const subjectHtml = htmlEscape(safeSubject);
    const messageHtml = htmlEscape(safeMessage);

    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(safeEmail)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    if (safeMessage.length > 2000) {
      return NextResponse.json({ error: 'Message is too long (max 2000 characters).' }, { status: 400 });
    }

    const subjectHtmlLine = subjectHtml || 'New Contact Form Message';

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1d4ed8;margin-bottom:4px">New Contact Message</h2>
        <p style="color:#64748b;margin-top:0">via RemoteJobs44 contact form</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#64748b;width:100px">From</td><td style="padding:6px 0;font-weight:600;color:#1e293b">${nameHtml}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0"><a href="mailto:${emailHtml}" style="color:#1d4ed8">${emailHtml}</a></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Subject</td><td style="padding:6px 0;color:#1e293b">${subjectHtmlLine}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
        <h3 style="color:#1e293b;margin-bottom:8px">Message</h3>
        <p style="color:#334155;line-height:1.7;white-space:pre-wrap">${messageHtml}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
        <p style="color:#94a3b8;font-size:12px">Reply directly to this email to respond to ${nameHtml}.</p>
      </div>
    `;

    // Subject line goes in a header — keep it as the safe (newline-stripped
    // but not html-escaped) form since email headers don't render HTML.
    const subjectLine = safeSubject || 'New Contact Form Message';
    const sent = await sendEmail({
      to: process.env.CONTACT_EMAIL ?? 'hello@remotejobs44.com',
      subject: `[Contact] ${subjectLine} — from ${safeName}`,
      html,
      replyTo: safeEmail,
    });

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 });
    }

    await sendEmail({
      to: safeEmail,
      subject: 'We received your message — RemoteJobs44',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#1d4ed8">Thanks for reaching out, ${nameHtml}!</h2>
          <p style="color:#334155;line-height:1.7">We have received your message and will get back to you within 24-48 hours.</p>
          <p style="color:#334155;line-height:1.7">In the meantime, you can browse remote jobs at <a href="https://remotejobs44.com" style="color:#1d4ed8">remotejobs44.com</a>.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
          <p style="color:#94a3b8;font-size:12px">The RemoteJobs44 Team</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    logError({ event: 'contact.unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
