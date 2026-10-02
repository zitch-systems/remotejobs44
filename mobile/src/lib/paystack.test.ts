jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

import { PaymentsNotConfiguredError, startSubscription } from './paystack';
import { supabase } from './supabase';
import * as WebBrowser from 'expo-web-browser';

const mockInvoke = supabase.functions.invoke as jest.Mock;
const mockOpenAuthSessionAsync = WebBrowser.openAuthSessionAsync as jest.Mock;

describe('startSubscription', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockOpenAuthSessionAsync.mockReset();
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
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
});
