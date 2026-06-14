// src/lib/secure-store-adapter.ts — an encrypted storage adapter for the
// Supabase auth session (the Supabase-recommended "LargeSecureStore" pattern).
//
// Why not raw SecureStore: it has a ~2 KB per-key limit and Supabase sessions
// (JWT + refresh token) can exceed it. So we keep a random AES-256 key in
// SecureStore (hardware-backed keystore / keychain) and store the *ciphertext*
// in AsyncStorage — small secret in secure storage, large blob encrypted at
// rest. Replaces the plaintext-AsyncStorage adapter from the audit.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import aesjs from 'aes-js';

// 256-bit key, AES-CTR.
const KEY_BYTES = 256 / 8;

async function encrypt(key: string, value: string): Promise<string> {
  const encryptionKey = Crypto.getRandomBytes(KEY_BYTES);
  const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
  const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  // Stash the per-value key in the secure keystore, keyed by the same name.
  await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
  return aesjs.utils.hex.fromBytes(encryptedBytes);
}

async function decrypt(key: string, value: string): Promise<string | null> {
  const encryptionKeyHex = await SecureStore.getItemAsync(key);
  if (!encryptionKeyHex) return null;
  const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
  const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
  return aesjs.utils.utf8.fromBytes(decryptedBytes);
}

export const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await decrypt(key, encrypted);
    } catch {
      // Corrupt/rotated key — treat as no session rather than throwing.
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  },
};
