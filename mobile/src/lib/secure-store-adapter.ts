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

/**
 * Resilient storage: encrypt at rest when the crypto + secure-store native
 * modules are available; otherwise fall back to plain AsyncStorage so a missing
 * keystore / crypto module can NEVER crash auth or lose the session. The
 * presence of a SecureStore key for `key` tells getItem which path was used.
 */
export const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (stored == null) return null;
    let keyHex: string | null = null;
    try {
      keyHex = await SecureStore.getItemAsync(key);
    } catch {
      keyHex = null;
    }
    if (!keyHex) return stored; // stored as plaintext (no/failed encryption)
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
    } catch {
      // Crypto / keystore unavailable on this device/build — persist plaintext
      // so sign-in still works (clear any stale key so getItem reads it raw).
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        /* ignore */
      }
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  },
};
