import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Txt } from '@/components/ui';
import { BrandLoader } from '@/components/BrandLoader';
import { hasPendingCheckout, resumePendingSubscription } from '@/lib/paystack';
import { spacing, useTheme } from '@/theme';
import { useAuth } from '@/lib/auth';

type State = 'verifying' | 'success' | 'pending' | 'cancelled' | 'signedOut' | 'missing' | 'error';

export default function PaystackReturn() {
  const { colors } = useTheme();
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();
  const [state, setState] = useState<State>('verifying');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      let active = true;
      hasPendingCheckout()
        .then((exists) => active && setState(exists ? 'signedOut' : 'missing'))
        .catch(() => active && setState('error'));
      return () => { active = false; };
    }
    let active = true;
    resumePendingSubscription()
      .then((result) => active && setState(result?.status ?? 'missing'))
      .catch(() => active && setState('error'));
    return () => { active = false; };
  }, [authLoading, user?.id]);

  const message = state === 'success'
    ? 'Payment verified. Your access has been refreshed.'
    : state === 'pending'
      ? 'Payment has not settled yet. You can safely try verification again without starting a new charge.'
      : state === 'cancelled'
        ? 'The payment was not completed. You can start a new checkout when you are ready.'
      : state === 'signedOut'
        ? 'Sign in to the account that started this payment to verify it safely. Your pending checkout is preserved.'
      : state === 'missing'
        ? 'There is no payment from this account waiting to be verified.'
        : 'We could not verify the payment. Your pending checkout is saved so you can try again.';

  return (
    <View style={{ flex: 1, padding: spacing.screenX, alignItems: 'center', justifyContent: 'center', gap: spacing[4], backgroundColor: colors.bgApp }}>
      {state === 'verifying' ? <BrandLoader label="Verifying payment" /> : (
        <>
          <Txt variant="h2" center>{state === 'success' ? 'Payment complete' : 'Payment status'}</Txt>
          <Txt center color={colors.fg3}>{message}</Txt>
          {(state === 'pending' || state === 'error') ? (
            <Button label="Try verification again" onPress={() => {
              setState('verifying');
              resumePendingSubscription().then((result) => setState(result?.status ?? 'missing')).catch(() => setState('error'));
            }} />
          ) : null}
          {state === 'signedOut' ? <Button label="Sign in to verify" onPress={() => router.replace('/(auth)/sign-in')} /> : null}
          <Button label="Back to plans" variant="ghost" onPress={() => router.replace('/profile/plans')} />
        </>
      )}
    </View>
  );
}
