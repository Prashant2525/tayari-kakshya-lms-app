'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { checkoutAction, quoteAction } from '@/app/actions/checkout';
import { failureText } from '@/lib/failure';
import type { MessageKey } from '@/lib/messages';
import type { CheckoutItem, PaymentOptions, Quote } from '@/lib/types';
import { useT } from './i18n-provider';
import { Alert, button, Card, Chip, input } from './ui';

const PROVIDER_LABEL = { esewa: 'eSewa', khalti: 'Khalti' } as const;
/**
 * Checkout (Phase 11) on the website: every amount is the server's quote (sale, coupon D-025, VAT D-055); the
 * student picks a gateway and finishes on its page, or gets access at once when a coupon covers everything (D-056).
 */
export function Checkout({
  item,
  title,
  validity,
  note,
  initialQuote,
  linkError,
  providers,
  alreadyHaveKey,
}: {
  item: CheckoutItem;
  title: string;
  validity: string;
  note?: string | undefined;
  initialQuote: Quote;
  /** A share-link coupon that did not apply: why. */
  linkError: string | null;
  providers: PaymentOptions['providers'];
  alreadyHaveKey: MessageKey;
}) {
  const { t, npr } = useT();
  const router = useRouter();
  const [quote, setQuote] = useState(initialQuote);
  const [couponOpen, setCouponOpen] = useState(Boolean(linkError));
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(linkError);
  const [payError, setPayError] = useState<string | null>(null);
  const [chosen, setChosen] = useState(providers[0]?.provider ?? null);
  const [applying, startApply] = useTransition();
  const [paying, startPay] = useTransition();
  const free = quote.totalPaisa === 0;
  const rate = quote.tax ? String(quote.tax.rateBps / 100) : '';

  const requote = (coupon: string | null) =>
    startApply(async () => {
      const res = await quoteAction(item, coupon);
      if (res.ok) {
        setQuote(res.quote);
        setCouponError(null);
        setCode('');
      } else {
        setCouponError(failureText(res, t, alreadyHaveKey));
      }
    });

  const pay = () =>
    startPay(async () => {
      setPayError(null);
      const res = await checkoutAction(item, quote.coupon?.code ?? null, free ? null : chosen);
      if (!res.ok) {
        setPayError(failureText(res, t, alreadyHaveKey));
        return;
      }
      if (res.redirectUrl) window.location.assign(res.redirectUrl);
      else router.push(`/payment-result?order=${res.orderId}`);
    });

  const line = (label: string, value: string, muted = false) => (
    <div
      className={`flex items-baseline justify-between gap-3 text-[15px] ${muted ? 'text-text-secondary' : 'text-text'}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h1 className="text-3xl font-bold text-text">{t('checkout.title')}</h1>
      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        <p className="text-sm text-text-secondary">{validity}</p>
        {note ? <p className="text-sm text-text-secondary">{note}</p> : null}
        <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-3 text-[15px] text-text">
            <span>{t('checkout.price')}</span>
            <span className="flex items-baseline gap-2">
              {quote.regularPricePaisa > quote.subtotalPaisa ? (
                <span className="text-sm text-text-muted line-through">{npr(quote.regularPricePaisa)}</span>
              ) : null}
              {npr(quote.subtotalPaisa)}
            </span>
          </div>
          {quote.coupon && quote.discountPaisa > 0
            ? line(t('checkout.discount', { code: quote.coupon.code }), `− ${npr(quote.discountPaisa)}`)
            : null}
          {quote.referral ? line(t('checkout.referral'), `− ${npr(quote.referral.discountPaisa)}`) : null}
          {quote.tax && !quote.tax.inclusive ? line(t('checkout.vat', { rate }), npr(quote.tax.paisa)) : null}
          <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2 text-lg font-bold text-text">
            <span>{t('checkout.total')}</span>
            <span data-testid="total">{npr(quote.totalPaisa)}</span>
          </div>
          {quote.tax?.inclusive
            ? line(t('checkout.vatIncluded', { rate }), npr(quote.tax.paisa), true)
            : null}
        </div>
      </Card>

      {quote.couponSkipped ? (
        <Alert tone="info">{t('checkout.couponSkipped', { code: quote.couponSkipped })}</Alert>
      ) : null}
      {quote.coupon ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-success-soft px-4 py-3 text-success">
          <span className="font-medium">{t('checkout.couponApplied', { code: quote.coupon.code })}</span>
          <button
            type="button"
            onClick={() => requote(null)}
            disabled={applying}
            className="min-h-11 px-2 font-semibold underline"
          >
            {t('checkout.removeCoupon')}
          </button>
        </div>
      ) : couponOpen ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) requote(code.trim());
          }}
        >
          <label htmlFor="coupon" className="text-sm font-semibold text-text">
            {t('checkout.couponLabel')}
          </label>
          <div className="flex gap-2">
            <input
              id="coupon"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setCouponError(null);
              }}
              autoCapitalize="characters"
              autoComplete="off"
              aria-invalid={Boolean(couponError)}
              aria-describedby={couponError ? 'coupon-error' : undefined}
              className={`${input} font-mono uppercase`}
            />
            <button className={button.secondary} disabled={!code.trim() || applying}>
              {t('checkout.apply')}
            </button>
          </div>
          {couponError ? (
            <p id="coupon-error" className="text-sm text-danger">
              {couponError}
            </p>
          ) : null}
        </form>
      ) : (
        <button type="button" onClick={() => setCouponOpen(true)} className={`${button.link} self-start`}>
          {t('checkout.haveCoupon')}
        </button>
      )}

      {free ? (
        <Alert tone="success">{t('checkout.freeNote')}</Alert>
      ) : providers.length === 0 ? (
        <Alert tone="info">{t('checkout.unavailable')}</Alert>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-text">{t('checkout.payWith')}</legend>
          {providers.map((p) => (
            <label
              key={p.provider}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md bg-surface px-4 ${chosen === p.provider ? 'border-2 border-primary' : 'border border-border'}`}
            >
              <input
                type="radio"
                name="provider"
                value={p.provider}
                checked={chosen === p.provider}
                onChange={() => setChosen(p.provider)}
                className="size-5 accent-[var(--tk-primary)]"
              />
              <span className="flex-1 font-medium text-text">{PROVIDER_LABEL[p.provider]}</span>
              {p.testMode ? <Chip>{t('checkout.testMode')}</Chip> : null}
            </label>
          ))}
          <p className="text-xs text-text-secondary">{t('checkout.note')}</p>
        </fieldset>
      )}

      {payError ? <Alert>{payError}</Alert> : null}
      {free || providers.length ? (
        <button type="button" onClick={pay} disabled={paying || applying} className={button.primary}>
          {free ? t('checkout.getFree') : t('checkout.pay', { amount: npr(quote.totalPaisa) })}
        </button>
      ) : null}
    </div>
  );
}
