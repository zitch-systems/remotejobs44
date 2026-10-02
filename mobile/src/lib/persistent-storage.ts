import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const serverWebStorage = {
  getItem: async (_key: string): Promise<string | null> => null,
  setItem: async (_key: string, _value: string): Promise<void> => {},
  removeItem: async (_key: string): Promise<void> => {},
};

/**
 * AsyncStorage on native and in the browser, with an inert adapter during
 * Expo Router's Node static render where window/localStorage do not exist.
 */
export const persistentStorage =
  Platform.OS === 'web' && typeof window === 'undefined' ? serverWebStorage : AsyncStorage;
