import { redirect } from 'next/navigation';

// /settings has been merged into /profile — one page now owns identity, CV,
// billing links, email preferences, theme, support, and the danger zone.
// The route stays as a permanent redirect so old bookmarks, the app's
// historical deep links, and any indexed URLs keep working.
export default function SettingsPage() {
  redirect('/profile');
}
