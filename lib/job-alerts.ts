import { CATEGORY_META } from '@/lib/utils';

const ALERT_CATEGORIES = new Set(Object.keys(CATEGORY_META));

export function normalizeAlertCategory(value: unknown): string | null | undefined {
  if (value == null || value === '') return null;
  const category = String(value).trim().toLowerCase();
  return ALERT_CATEGORIES.has(category) ? category : undefined;
}
