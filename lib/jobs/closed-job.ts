export function isSafeClosedJobMeta(row: { flagged?: boolean | null }): boolean {
  return row.flagged !== true;
}
