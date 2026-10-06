import 'server-only';
import { redirect } from 'next/navigation';
import { quoteAction } from '@/app/actions/checkout';
import { failureText } from './failure';
import { api, ApiError, signedIn } from './api';
import { getI18n } from './i18n';
import type { MessageKey } from './messages';
import type { CheckoutItem, PaymentOptions, Quote } from './types';

/**
 * Everything a checkout page needs before it renders: the student must be signed in (back here afterwards, coupon
 * kept); the server's quote — with the share-link coupon when it applies, otherwise without it and the reason (D-056).
 */
export async function prepareCheckout(
  item: CheckoutItem,
  here: string,
  coupon: string | undefined,
  alreadyHaveKey: MessageKey,
): Promise<
  | { ok: true; quote: Quote; linkError: string | null; providers: PaymentOptions['providers'] }
  | { ok: false; message: string }
> {
  if (!(await signedIn())) redirect(`/login?next=${encodeURIComponent(here)}`);
  const { t } = await getI18n();
  const code = coupon?.trim().toUpperCase() || null;
  let linkError: string | null = null;
  let result = await quoteAction(item, code);
  if (!result.ok && result.code === 'COUPON_NOT_VALID') {
    linkError = failureText(result, t, alreadyHaveKey);
    result = await quoteAction(item, null);
  }
  if (!result.ok) {
    if (result.code === 'UNAUTHENTICATED' || result.code === 'TOKEN_EXPIRED') {
      redirect(`/login?next=${encodeURIComponent(here)}`);
    }
    return { ok: false, message: failureText(result, t, alreadyHaveKey) };
  }
  const options = await api<PaymentOptions>('/payments/options').catch((err: unknown) => {
    if (err instanceof ApiError) return { providers: [] };
    throw err;
  });
  return { ok: true, quote: result.quote, linkError, providers: options.providers };
}
