import type { Metadata } from 'next';
import PaymentReturn from './PaymentReturn';

export const metadata: Metadata = {
  title: 'Return to the app',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// This page only hands control back to the app. Query parameters never grant
// access or choose a destination: the app verifies its own saved transaction.
export default function MobilePaymentReturnPage() {
  return <PaymentReturn />;
}
