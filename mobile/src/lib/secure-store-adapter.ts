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
// A device with an unavailable keystore may keep the current login in memory,
// but must never persist its refresh token in plaintext.
const volatileItems = new Map<string, string>();

/**
 * Resilient storage: encrypt at rest when the crypto + secure-store native
 * modules are available; otherwise keep only a process-local session. A cold
 * start then requires sign-in again instead of leaving tokens unencrypted.
 */
export const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    if (volatileItems.has(key)) return volatileItems.get(key)!;
    const stored = await AsyncStorage.getItem(key);
    if (stored == null) return null;
    let keyHex: string | null = null;
    try {
      keyHex = await SecureStore.getItemAsync(key);
    } catch {
      keyHex = null;
    }
    // Missing keys also occur after an Android backup is restored. Ciphertext
    // without its key, and legacy plaintext fallback sessions, require sign-in.
    if (!keyHex) return null;
    try {
      const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
      return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(stored)));
    } catch {
      // Corrupt / rotated key — treat as no session rather than throwing.
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const encryptionKey = Crypto.getRandomBytes(KEY_BYTES);
      const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
      const ciphertext = aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(value)));
      await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
      await AsyncStorage.setItem(key, ciphertext);
      volatileItems.delete(key);
    } catch {
      volatileItems.set(key, value);
      // Remove any previous durable value; never write the unencrypted token.
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        /* an old encrypted value remains unusable once its key is removed */
      }
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        /* ignore */
      }
    }
  },
  async removeItem(key: string): Promise<void> {
    volatileItems.delete(key);
    // Attempt both independently: an AsyncStorage failure must not leave the
    // keystore secret behind (and vice versa).
    await Promise.allSettled([AsyncStorage.removeItem(key), SecureStore.deleteItemAsync(key)]);
  },
};
