import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadFeedCache, saveFeedCache } from './feed-cache';
import type { Job } from './types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

it('removes legacy cached employer identity instead of showing it on cold start', async () => {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([{ id: 'old', company: 'Real Employer' }]));
  expect(await loadFeedCache()).toBeNull();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('rj44-feed-cache');
});

it('does not persist Day Pass apply links even when company identity is masked', async () => {
  await saveFeedCache([{ id: 'paid', company: 'Hidden Company', applyUrl: 'https://example.com/apply' } as Job]);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(AsyncStorage.removeItem).toHaveBeenCalled();
});

it('restores only masked public rows without paid channels', async () => {
  const rows = [{ id: 'public', company: 'Hidden Company' }];
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(rows));
  expect(await loadFeedCache()).toEqual(rows);
  await saveFeedCache(rows as Job[]);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('rj44-feed-cache', JSON.stringify(rows));
});
