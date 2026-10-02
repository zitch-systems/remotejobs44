/** Operational failures exclude intentional pauses, deferred work and healthy zero-result searches. */
export function ingestFailureEntries(results: Record<string, number | string>) {
  return Object.entries(results).filter(([, value]) => typeof value === 'string' && (
    value.startsWith('error:') || value.startsWith('db error:') || value.includes(' rows failed:')
  ));
}
