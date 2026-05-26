# Supabase Auth Email Templates

Supabase sends the **Confirm Sign-Up**, **Reset Password**, **Magic Link**, and **Invite User** emails — these are sent from Supabase's infrastructure (not from our Next.js code), so they can only be edited via the Supabase Dashboard.

## Where to paste

1. Open https://supabase.com/dashboard/project/gnyilmahiyddplsrrhoq/auth/templates
2. For each template type, click the template name in the left rail
3. Paste the matching HTML from this folder into the **"Message body"** textarea
4. Leave **Subject heading** as the default (or customise to taste — these templates assume the dashboard subject lines)
5. Click **Save changes**

| File | Supabase template name |
|---|---|
| `confirm-signup.html` | Confirm signup |
| `reset-password.html` | Reset password |
| `magic-link.html` | Magic Link |
| `invite-user.html` | Invite user |

## Variables provided by Supabase

Inside the template, Supabase replaces these placeholders:

- `{{ .ConfirmationURL }}` — the action link (confirm / reset / magic / invite)
- `{{ .Email }}` — the recipient address
- `{{ .Token }}` / `{{ .TokenHash }}` — for OTP flows (not used here)
- `{{ .SiteURL }}` — the project's site URL from Supabase settings

## Logo

All templates link to `https://remotejobs44.com/icons/icon-192.png`. If you change the production domain, update the `<img src>` in each file.

## Why not just edit `lib/email/templates.ts`?

That file holds *our* templates (welcome, payment-receipt, job alert) sent via Resend from our API routes. Supabase's auth emails go out before our code runs — we never see them — so they must be configured at Supabase.
