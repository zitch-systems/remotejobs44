const mockValues = new Map<string, string>();
const mockKeys = new Map<string, string>();
const mockSetKey = jest.fn(async (key: string, value: string) => { mockKeys.set(key, value); });
const mockRemoveValue = jest.fn(async (key: string) => { mockValues.delete(key); });
const mockDeleteKey = jest.fn(async (key: string) => { mockKeys.delete(key); });
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
  removeItem: (...args: [string]) => mockRemoveValue(...args),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockKeys.get(key) ?? null),
  setItemAsync: (...args: [string, string]) => mockSetKey(...args),
  deleteItemAsync: (...args: [string]) => mockDeleteKey(...args),
}));
jest.mock('expo-crypto', () => ({ getRandomBytes: (size: number) => new Uint8Array(size).fill(7) }));

import { LargeSecureStore } from './secure-store-adapter';

describe('native session persistence', () => {
  beforeEach(() => {
    mockValues.clear();
    mockKeys.clear();
    mockSetKey.mockClear();
    mockRemoveValue.mockClear();
    mockDeleteKey.mockClear();
  });

  it('persists encrypted data and restores the session with its keystore key', async () => {
    await LargeSecureStore.setItem('encrypted', 'private-refresh-token');
    expect(mockValues.get('encrypted')).not.toContain('private-refresh-token');
    expect(await LargeSecureStore.getItem('encrypted')).toBe('private-refresh-token');
    await LargeSecureStore.removeItem('encrypted');
    expect(await LargeSecureStore.getItem('encrypted')).toBeNull();
  });

  it('keeps a usable volatile session without persisting plaintext if the keystore fails', async () => {
    mockSetKey.mockRejectedValueOnce(new Error('keystore unavailable'));
    await LargeSecureStore.setItem('volatile', 'private-refresh-token');
    expect(mockValues.has('volatile')).toBe(false);
    expect(await LargeSecureStore.getItem('volatile')).toBe('private-refresh-token');
    await LargeSecureStore.removeItem('volatile');
    expect(await LargeSecureStore.getItem('volatile')).toBeNull();
  });

  it('does not treat restored ciphertext or legacy plaintext as a session without its key', async () => {
    mockValues.set('restored', 'legacy-plaintext-token');
    expect(await LargeSecureStore.getItem('restored')).toBeNull();
  });

  it('still deletes the keystore key when AsyncStorage removal fails', async () => {
    mockKeys.set('session', 'secret-key');
    mockRemoveValue.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(LargeSecureStore.removeItem('session')).resolves.toBeUndefined();
    expect(mockDeleteKey).toHaveBeenCalledWith('session');
    expect(mockKeys.has('session')).toBe(false);
  });
});
