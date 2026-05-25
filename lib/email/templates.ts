// lib/email/templates.ts — Email HTML templates

export function welcomeEmail(name: string) {
  return {
    subject: 'Welcome to RemoteJobs44 🌍',
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
  <div style="background:#2563eb;padding:32px 40px">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">RemoteJobs44</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:14px">Your global remote career starts here</p>
  </div>
  <div style="padding:40px">
    <h2 style="margin:0 0 16px;color:#1c1917;font-size:20px">Welcome, ${name}! 👋</h2>
    <p style="margin:0 0 20px;color:#57534e;line-height:1.6">You're now part of RemoteJobs44 — your platform for finding the best remote jobs worldwide.</p>
    <div style="background:#eff6ff;border-radius:8px;padding:20px;margin:0 0 24px">
      <p style="margin:0 0 12px;color:#2563eb;font-weight:600;font-size:14px">What you can do for free:</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#1d4ed8;font-size:14px;line-height:2">
        <li>Browse 50,000+ remote jobs</li>
        <li>Save your favourite listings</li>
        <li>Explore company profiles</li>
      </ul>
    </div>
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/jobs" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">Browse Jobs →</a>
    <hr style="border:none;border-top:1px solid #e7e5e4;margin:32px 0">
    <p style="margin:0 0 8px;color:#a8a29e;font-size:13px">To apply to any job, upgrade from <strong>₦500</strong>. <a href="${process.env.NEXT_PUBLIC_APP_URL}/pricing" style="color:#2563eb">See plans →</a></p>
    <p style="margin:0;color:#a8a29e;font-size:13px">Follow us for daily job drops: <a href="https://instagram.com/remotejobs_44" style="color:#2563eb">@remotejobs_44 on Instagram</a></p>
  </div>
</div>
</body></html>`,
  };
}

export function paymentSuccessEmail(name: string, plan: string, amount: string) {
  const planLabel = plan === 'daily' ? 'Day Pass' : plan === 'pro_annual' ? 'Pro Annual' : 'Pro Monthly';
  return {
    subject: `Payment confirmed — ${planLabel} ✅`,
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
  <div style="background:#2563eb;padding:32px 40px">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">RemoteJobs44</h1>
  </div>
  <div style="padding:40px">
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:48px">✅</div>
      <h2 style="margin:16px 0 8px;color:#1c1917">Payment confirmed!</h2>
      <p style="color:#57534e;margin:0">Thank you, ${name}</p>
    </div>
    <div style="background:#f5f5f4;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#78716c;font-size:14px">Plan</span>
        <span style="color:#1c1917;font-weight:600;font-size:14px">${planLabel}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#78716c;font-size:14px">Amount</span>
        <span style="color:#1c1917;font-weight:600;font-size:14px">${amount}</span>
      </div>
    </div>
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">Go to Dashboard →</a>
    <hr style="border:none;border-top:1px solid #e7e5e4;margin:32px 0">
    <p style="margin:0;color:#a8a29e;font-size:13px">Need help? <a href="${process.env.NEXT_PUBLIC_APP_URL}/contact" style="color:#2563eb">Contact us</a></p>
  </div>
</div>
</body></html>`,
  };
}

export function jobAlertEmail(name: string, jobs: Array<{ title: string; company: string; location: string; id: string }>) {
  const jobRows = jobs.slice(0, 5).map(j => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f5f5f4">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/jobs/${j.id}" style="color:#2563eb;font-weight:600;text-decoration:none;font-size:14px">${j.title}</a>
        <div style="color:#78716c;font-size:13px;margin-top:2px">${j.company} · ${j.location}</div>
      </td>
    </tr>`).join('');

  return {
    subject: `${jobs.length} new remote jobs matching your interests`,
    html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
  <div style="background:#2563eb;padding:32px 40px">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">RemoteJobs44</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:14px">Job Alert</p>
  </div>
  <div style="padding:40px">
    <h2 style="margin:0 0 8px;color:#1c1917">Hi ${name},</h2>
    <p style="margin:0 0 24px;color:#57534e">${jobs.length} new remote jobs were posted that match your interests:</p>
    <table style="width:100%;border-collapse:collapse">${jobRows}</table>
    <div style="margin-top:24px">
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/jobs" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">View All Jobs →</a>
    </div>
    <hr style="border:none;border-top:1px solid #e7e5e4;margin:32px 0">
    <p style="margin:0;color:#a8a29e;font-size:12px">You're receiving this because you have job alerts enabled. <a href="${process.env.NEXT_PUBLIC_APP_URL}/profile" style="color:#2563eb">Manage alerts</a></p>
  </div>
</div>
</body></html>`,
  };
}
