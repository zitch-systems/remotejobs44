// src/lib/profile-api.ts — the profile writes the app can't do straight to the
// database.
//
// `authenticated` may only UPDATE profiles.name (migration_v9), and the guard
// trigger from migration_v62 protects the privileged columns on top of that, so
// everything else — preferences, details, the photo URL, the CV — goes through
// the web API, which validates it and writes with the service role. The app
// authenticates with its Supabase access token (see ./api). Reads and
// `saveName` stay direct (lib/profile.ts).
//
// Kept separate from lib/profile.ts (React hooks + the zustand store) so the
// write path is unit-testable with just a mocked network and file system.
import { File, UploadType } from 'expo-file-system';
import { ApiError, apiErrorMessage, apiFetch, apiUrl, toApiError } from './api';
import { supabase } from './supabase';
import type { ProfileDetails } from './profile-details';

export interface PreferencesInput {
  skills: string[];
  targetRole: string | null;
  headline: string | null;
}

/** PATCH the caller's own profile; the server whitelists and validates every field. */
async function patchProfile(fields: Record<string, unknown>): Promise<void> {
  const res = await apiFetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw await toApiError(res, 'Could not save your changes. Please try again.');
}

export async function savePreferences(_userId: string, prefs: PreferencesInput): Promise<void> {
  await patchProfile({
    skills: prefs.skills,
    target_role: prefs.targetRole,
    // The preferences screen has no headline field and passes null. Sending that
    // would wipe a headline that is set, so only send one that is present.
    ...(prefs.headline != null ? { headline: prefs.headline } : {}),
  });
}

export async function saveDetails(_userId: string, details: ProfileDetails): Promise<void> {
  await patchProfile({ bio: details.bio, links: details.links, experience: details.experience });
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/**
 * Upload a picked image to the public `avatars` bucket (the bucket policy limits
 * writes to the user's own folder), then record its URL on the profile. The
 * server only accepts a URL inside that folder.
 */
export async function uploadAvatar(
  userId: string,
  asset: { uri: string; name?: string | null; mimeType?: string | null },
): Promise<string> {
  const ext = ((asset.name ?? '').split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const file = new File(asset.uri);
  if (file.size > MAX_AVATAR_BYTES) throw new ApiError(400, 'Please choose a photo under 5 MB.');
  const buffer = await file.arrayBuffer();

  const { error } = await supabase.storage.from('avatars').upload(path, buffer, {
    contentType: asset.mimeType ?? 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;

  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  try {
    await patchProfile({ avatar_url: url });
  } catch (e) {
    // Don't leave an orphaned photo in the public bucket when the profile
    // update is refused.
    await supabase.storage.from('avatars').remove([path]).catch(() => {});
    throw e;
  }
  return url;
}

const CV_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const MAX_CV_BYTES = 5 * 1024 * 1024; // matches /api/cv and the bucket limit
const CV_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * The MIME type /api/cv will accept for a picked document, or null when it isn't
 * a PDF or Word file. The picker's own type wins; some Android providers report
 * `application/octet-stream`, so fall back to the extension.
 */
export function cvMimeType(asset: { name: string; mimeType?: string | null }): string | null {
  const declared = (asset.mimeType ?? '').toLowerCase();
  if (Object.values(CV_MIME_BY_EXTENSION).includes(declared)) return declared;
  const ext = (asset.name.split('.').pop() ?? '').toLowerCase();
  return CV_MIME_BY_EXTENSION[ext] ?? null;
}

/**
 * Upload a picked CV through POST /api/cv — the same endpoint, Pro gate, rate
 * limit and magic-byte check as the web — instead of writing to Storage and the
 * profile directly. Resolves with a short-lived signed URL for the stored file.
 */
export async function uploadCv(
  _userId: string,
  asset: { uri: string; name: string; mimeType?: string | null },
): Promise<string> {
  const mimeType = cvMimeType(asset);
  if (!mimeType) throw new ApiError(400, 'Please choose a PDF or Word document.');
  const file = new File(asset.uri);
  if (file.size > MAX_CV_BYTES) throw new ApiError(400, 'File too large (max 5MB).');

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, apiErrorMessage(401, null, ''));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CV_UPLOAD_TIMEOUT_MS);
  try {
    const result = await file.upload(apiUrl('/api/cv'), {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'cv',
      mimeType,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      sessionType: 'foreground',
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = JSON.parse(result.body);
    } catch {
      /* not JSON (a proxy error page): fall through to the generic message */
    }
    if (result.status < 200 || result.status >= 300) {
      throw new ApiError(result.status, apiErrorMessage(result.status, body, 'Upload failed. Please try again.'));
    }
    const url = (body as { url?: unknown } | null)?.url;
    return typeof url === 'string' ? url : '';
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Transport failure or the timeout above: the native error text is not for users.
    throw new ApiError(0, 'Could not upload your CV. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}
