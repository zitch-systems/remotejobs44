import { permanentRedirect } from 'next/navigation';

// /settings has been merged into /profile — one page now owns identity, CV,
// billing links, email preferences, theme, support, and the danger zone.
// The route stays as a permanent redirect so old bookmarks, the app's
// historical deep links, and any indexed URLs keep working.
//
// Use permanentRedirect (HTTP 308), not redirect (307): a 308 tells search
// engines the move is permanent so they consolidate link equity onto /profile
// and drop /settings from the index, which is what the comment above intends.
export default function SettingsPage() {
  permanentRedirect('/profile');
}
