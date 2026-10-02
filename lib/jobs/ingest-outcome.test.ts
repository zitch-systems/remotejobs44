import { expect, it } from 'vitest';
import { ingestFailureEntries } from './ingest-outcome';
it('fails partial database imports and upstream errors even when other sources succeed', () => {
  expect(ingestFailureEntries({ Arbeitnow: '198 (1 rows failed: statement timeout)', JobSpy: 'error: HTTP 500', Healthy: 20 })).toHaveLength(2);
});
it('keeps empty, deduplicated, paused and deferred results healthy', () => {
  expect(ingestFailureEntries({ Empty: 0, Duplicate: '0 (+12 already on platform)', Paused: 'paused', Deferred: 'skipped: time budget' })).toEqual([]);
});
