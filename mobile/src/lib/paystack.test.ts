jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() }, auth: { getUser: jest.fn() } } }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasPendingCheckout, loadOwnPendingCheckout, PaymentsNotConfiguredError, resumePendingSubscription, startSubscription } from './paystack';
import { supabase } from './supabase';
import * as WebBrowser from 'expo-web-browser';

const mockInvoke = supabase.functions.invoke as jest.Mock;
const mockOpenAuthSessionAsync = WebBrowser.openAuthSessionAsync as jest.Mock;
const mockGetUser = supabase.auth.getUser as jest.Mock;
const USER_ID = '11111111-1111-4111-8111-111111111111';

function httpError(status: number, body: object) {
  return { context: new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }) };
}

describe('startSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoke.mockReset();
    mockOpenAuthSessionAsync.mockReset();
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('falls back only when the server explicitly reports no configuration', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { configured: false }, error: null });
    await expect(startSubscription('pro')).rejects.toBeInstanceOf(PaymentsNotConfiguredError);

    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('network') });
    await expect(startSubscription('pro')).rejects.toThrow('Could not start checkout');
  });

  it('verifies after the browser closes and accepts only known fulfilled plans', async () => {
    mockInvoke
      .mockResolvedValueOnce({ data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'ref' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, plan: 'pro' }, error: null });
    await expect(startSubscription('annual')).resolves.toEqual({ status: 'success', plan: 'pro' });
    expect(mockInvoke).toHaveBeenLastCalledWith('paystack-verify', { body: { reference: 'ref' } });
  });

  it('surfaces verification outages instead of reporting a cancellation', async () => {
    mockInvoke
      .mockResolvedValueOnce({ data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'ref' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('timeout') });
    await expect(startSubscription('daily')).rejects.toThrow('Could not verify payment');
  });

  it('rejects non-HTTPS checkout URLs', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { authorization_url: 'http://example.test/pay', reference: 'ref' }, error: null });
    await expect(startSubscription('daily')).rejects.toThrow('invalid payment URL');
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('persists an owner-bound reference before opening the browser', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'remotejobs44://paystack-return' });
    mockInvoke
      .mockResolvedValueOnce({ data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'ref-owned' }, error: null })
      .mockResolvedValueOnce({ data: { ok: false, error: 'Payment not completed.' }, error: null });
    await expect(startSubscription('pro')).resolves.toEqual({ status: 'pending' });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'rj44-pending-paystack-v1',
      expect.stringContaining(`"userId":"${USER_ID}"`),
    );
  });

  it('clears a definitively abandoned provider checkout', async () => {
    mockInvoke
      .mockResolvedValueOnce({ data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'ref-cancel' }, error: null })
      .mockResolvedValueOnce({ data: null, error: httpError(402, { error: 'Payment not completed.', transaction_status: 'abandoned' }) });
    await expect(startSubscription('daily')).resolves.toEqual({ status: 'cancelled' });
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('rj44-pending-paystack-v1');
  });

  it('retains a processing transaction returned as a real Functions HTTP error', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
    mockInvoke
      .mockResolvedValueOnce({ data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'ref-processing' }, error: null })
      .mockResolvedValueOnce({ data: null, error: httpError(402, { error: 'Payment not completed.', transaction_status: 'processing' }) });
    await expect(startSubscription('pro')).resolves.toEqual({ status: 'pending' });
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('never resumes another account pending reference', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ reference: 'other-ref', userId: '22222222-2222-4222-8222-222222222222', plan: 'pro', createdAt: Date.now() }));
    await expect(loadOwnPendingCheckout()).resolves.toBeNull();
    await expect(resumePendingSubscription()).resolves.toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('rj44-pending-paystack-v1');
  });

  it('preserves a valid pending record when auth lookup fails transiently', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ reference: 'valid-ref', userId: USER_ID, plan: 'annual', createdAt: Date.now() }));
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('offline') });
    await expect(loadOwnPendingCheckout()).rejects.toThrow('offline');
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('preserves a valid owner record while signed out without returning it for verification', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ reference: 'valid-ref', userId: USER_ID, plan: 'pro', createdAt: Date.now() }));
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(loadOwnPendingCheckout()).resolves.toBeNull();
    await expect(hasPendingCheckout()).resolves.toBe(true);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it.each(['null', '123', '"text"', '{"reference":123,"userId":"' + USER_ID + '","plan":"pro","createdAt":1}'])(
    'removes malformed pending JSON value %s',
    async (raw) => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(raw);
      await expect(loadOwnPendingCheckout()).resolves.toBeNull();
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('rj44-pending-paystack-v1');
    },
  );

  it('rejects lookalike checkout origins and malformed stored records', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { authorization_url: 'https://checkout.paystack.com.evil.test/x', reference: 'ref' }, error: null });
    await expect(startSubscription('daily')).rejects.toThrow('invalid payment URL');
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ reference: 'bad ref', userId: USER_ID, plan: 'annual', createdAt: Date.now() + 86_400_000 }));
    await expect(loadOwnPendingCheckout()).resolves.toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
  });

  it('serializes concurrent callback and browser verification for one reference', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ reference: 'same-ref', userId: USER_ID, plan: 'pro', createdAt: Date.now() }));
    mockInvoke.mockResolvedValue({ data: { ok: true, plan: 'pro' }, error: null });
    await expect(Promise.all([resumePendingSubscription(), resumePendingSubscription()])).resolves.toEqual([
      { status: 'success', plan: 'pro' },
      { status: 'success', plan: 'pro' },
    ]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
