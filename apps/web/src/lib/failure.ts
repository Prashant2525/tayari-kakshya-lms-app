import { ERROR_KEY, type MessageKey, type Translate } from './messages';

/** A failed API call as the website's server actions report it. */
export type Failure = { ok: false; code: string; reason: string | null };

const COUPON_REASONS = new Set([
  'not_found',
  'inactive',
  'not_started',
  'ended',
  'used_up',
  'already_used',
  'not_applicable',
  'below_minimum',
  'on_sale',
]);

/** A translated sentence for a failed quote, coupon or order. */
export function failureText(f: Failure, t: Translate, alreadyHaveKey: MessageKey): string {
  if (f.code === 'COUPON_NOT_VALID' && f.reason && COUPON_REASONS.has(f.reason)) {
    return t(`coupon.${f.reason}` as MessageKey);
  }
  if (f.code === 'PURCHASE_NOT_AVAILABLE' && f.reason === 'already_has_access') return t(alreadyHaveKey);
  if (f.code === 'PURCHASE_NOT_AVAILABLE' && f.reason === 'channel_closed') return t('checkout.unavailable');
  return t(ERROR_KEY[f.code] ?? 'error.generic');
}
