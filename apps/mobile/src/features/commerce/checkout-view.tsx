import { radius } from '@tk/design-tokens';
import { formatNpr } from '@tk/domain';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { ShieldCheck, TicketPercent, X } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  useApplyCoupon,
  useCheckout,
  usePaymentOptions,
  useQuote,
  type CheckoutItem,
  type ProviderName,
  type Quote,
} from '@/api/commerce';
import type { MessageKey } from '@/i18n/en';
import { localized, type Locale, type Translate } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { ApiError } from '@/lib/api-client';
import { bsDate } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Banner, Card, Screen, Skeleton } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

const PROVIDER_LABEL: Record<ProviderName, string> = { esewa: 'eSewa', khalti: 'Khalti' };

const COUPON_REASON: Record<string, MessageKey> = {
  not_found: 'coupon.not_found',
  inactive: 'coupon.inactive',
  not_started: 'coupon.not_started',
  ended: 'coupon.ended',
  used_up: 'coupon.used_up',
  already_used: 'coupon.already_used',
  not_applicable: 'coupon.not_applicable',
  below_minimum: 'coupon.below_minimum',
  on_sale: 'coupon.on_sale',
};

/** "Access for 30 days" / "Access until …" / "Access with no end date", from a course's or plan's validity. */
export function validityText(
  validity: { type: string; days: number | null; endsOn: string | null },
  t: Translate,
  locale: Locale,
) {
  return validity.type === 'days' && validity.days
    ? t('course.validityDays', { days: validity.days })
    : validity.type === 'fixed_date' && validity.endsOn
      ? t('course.validityUntil', { date: bsDate(`${validity.endsOn}T00:00:00+05:45`, locale) })
      : t('course.validityLifetime');
}

const reasonOf = (error: unknown) =>
  error instanceof ApiError ? (error.details as { reason?: string } | undefined)?.reason : undefined;

/** A translated sentence for a coupon or purchase error. */
function errorText(error: unknown, t: Translate, alreadyHaveKey: MessageKey) {
  const reason = reasonOf(error);
  if (error instanceof ApiError && error.code === 'COUPON_NOT_VALID' && reason && COUPON_REASON[reason]) {
    return t(COUPON_REASON[reason]);
  }
  if (
    error instanceof ApiError &&
    error.code === 'PURCHASE_NOT_AVAILABLE' &&
    reason === 'already_has_access'
  ) {
    return t(alreadyHaveKey);
  }
  return t(errorMessageKey(error));
}

/**
 * Checkout (Phase 11) for a course or a plan. Every amount — price, coupon discount (D-025), VAT (D-055), total — is
 * the server's quote; the app only shows it. Then a gateway and its own page, or, when a coupon leaves nothing to pay
 * (D-056), access at once. Access comes only from the server (the result screen asks it).
 */
export function CheckoutView({
  loading,
  item,
  alreadyHaveKey,
  note,
  initialCoupon,
}: {
  loading: boolean;
  item: CheckoutItem | null;
  alreadyHaveKey: MessageKey;
  note?: string | undefined;
  /** From a share link (`?coupon=CODE`): applied when checkout opens. */
  initialCoupon?: string | undefined;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const options = usePaymentOptions();
  const [applied, setApplied] = useState<string | null>(initialCoupon?.trim() || null);
  const quote = useQuote(item, applied);
  // A share-link coupon that does not apply: the quote without it, with the reason shown.
  const base = useQuote(item, null, Boolean(applied) && quote.isError);
  const checkout = useCheckout();
  const [chosen, setChosen] = useState<ProviderName | null>(null);
  const providers = options.data?.providers ?? [];
  const provider = chosen ?? providers[0]?.provider ?? null;

  if (loading || options.isPending || (item && quote.isPending)) {
    return (
      <Screen edges={['top']} contentStyle={styles.content}>
        <Skeleton height={140} />
        <Skeleton height={120} />
      </Screen>
    );
  }
  const linkCouponFailed = Boolean(applied) && quote.isError;
  const q: Quote | undefined = linkCouponFailed ? base.data : quote.data;
  const quoteError = linkCouponFailed ? base.error : quote.error;
  const free = q?.totalPaisa === 0;
  const canPay = Boolean(q) && (free || providers.length > 0);

  const pay = () => {
    if (!item || !q || (!free && !provider)) return;
    // The app's own return link (tayarikakshya://… in builds, exp://… in Expo Go); reaching it closes the browser.
    const appReturnUrl = Linking.createURL('payment-result');
    checkout.mutate(
      {
        item,
        couponCode: q.coupon?.code,
        provider: free ? null : provider,
        returnTo: Platform.OS === 'web' ? 'web' : 'app',
        appReturnUrl,
      },
      {
        onSuccess: async ({ order, redirectUrl }) => {
          if (!redirectUrl) {
            router.replace({ pathname: '/payment-result', params: { order: order.id } });
            return;
          }
          if (Platform.OS === 'web') {
            globalThis.location.assign(redirectUrl);
            return;
          }
          await WebBrowser.openAuthSessionAsync(redirectUrl, appReturnUrl).catch(() => undefined);
          // Whatever the browser reports, the result screen asks the server.
          router.replace({ pathname: '/payment-result', params: { order: order.id } });
        },
      },
    );
  };

  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('checkout.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
        {q ? (
          <>
            <Card style={{ gap: 8 }}>
              <Text variant="h4">{localized(q.title, locale)}</Text>
              <Text variant="bodySm" color="textSecondary">
                {validityText(q.validity, t, locale)}
              </Text>
              {note ? (
                <Text variant="caption" color="textSecondary">
                  {note}
                </Text>
              ) : null}
              <Lines q={q} />
            </Card>
            <CouponBox
              applied={q.coupon?.code ?? null}
              onApplied={setApplied}
              item={item!}
              alreadyHaveKey={alreadyHaveKey}
              linkError={linkCouponFailed ? errorText(quote.error, t, alreadyHaveKey) : null}
            />
            {free ? (
              <Banner tone="success" message={t('checkout.freeNote')} />
            ) : providers.length === 0 ? (
              <Banner tone="info" message={t('checkout.unavailable')} />
            ) : (
              <View style={{ gap: 8 }}>
                <Text variant="label">{t('checkout.payWith')}</Text>
                <View role="radiogroup" aria-label={t('checkout.payWith')} style={{ gap: 8 }}>
                  {providers.map((p) => {
                    const selected = p.provider === provider;
                    return (
                      <Pressable
                        key={p.provider}
                        role="radio"
                        aria-checked={selected}
                        aria-label={PROVIDER_LABEL[p.provider]}
                        onPress={() => setChosen(p.provider)}
                        style={[
                          styles.option,
                          {
                            backgroundColor: colors.surface,
                            borderColor: selected ? colors.primary : colors.border,
                            borderWidth: selected ? 2 : 1,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.radio,
                            { borderColor: selected ? colors.primary : colors.borderStrong },
                          ]}
                          aria-hidden
                        >
                          {selected ? (
                            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                          ) : null}
                        </View>
                        <Text variant="body" style={{ flex: 1 }}>
                          {PROVIDER_LABEL[p.provider]}
                        </Text>
                        {p.testMode ? <StatusChip tone="neutral" label={t('checkout.testMode')} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.note}>
                  <ShieldCheck size={16} color={colors.textSecondary} strokeWidth={1.75} />
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    {t('checkout.note')}
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <Banner
            tone={
              quoteError instanceof ApiError && reasonOf(quoteError) === 'channel_closed' ? 'info' : 'danger'
            }
            message={
              quoteError instanceof ApiError && reasonOf(quoteError) === 'channel_closed'
                ? t('checkout.unavailable')
                : errorText(quoteError, t, alreadyHaveKey)
            }
          />
        )}
        {checkout.error ? <Banner message={errorText(checkout.error, t, alreadyHaveKey)} /> : null}
      </ScrollView>
      {q && canPay ? (
        <Button
          label={
            free ? t('checkout.getFree') : t('checkout.pay', { amount: formatNpr(q.totalPaisa, locale) })
          }
          loading={checkout.isPending}
          onPress={pay}
        />
      ) : null}
    </Screen>
  );
}

/** Price, sale, coupon, VAT and total lines, exactly as the server priced them. */
function Lines({ q }: { q: Quote }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const rate = q.tax ? String(q.tax.rateBps / 100) : '';
  const row = (label: string, value: string, opts: { muted?: boolean; strike?: string } = {}) => (
    <View style={styles.line}>
      <Text variant="bodySm" color={opts.muted ? 'textSecondary' : 'text'} style={{ flex: 1 }}>
        {label}
      </Text>
      {opts.strike ? (
        <Text variant="caption" color="textMuted" style={{ textDecorationLine: 'line-through' }}>
          {opts.strike}
        </Text>
      ) : null}
      <Text variant="bodySm" color={opts.muted ? 'textSecondary' : 'text'}>
        {value}
      </Text>
    </View>
  );
  return (
    <View style={[styles.lines, { borderTopColor: colors.border }]}>
      {row(t('checkout.price'), formatNpr(q.subtotalPaisa, locale), {
        ...(q.regularPricePaisa > q.subtotalPaisa ? { strike: formatNpr(q.regularPricePaisa, locale) } : {}),
      })}
      {q.coupon && q.discountPaisa > 0
        ? row(t('checkout.discount', { code: q.coupon.code }), `− ${formatNpr(q.discountPaisa, locale)}`)
        : null}
      {q.tax && !q.tax.inclusive ? row(t('checkout.vat', { rate }), formatNpr(q.tax.paisa, locale)) : null}
      <View style={[styles.line, styles.total, { borderTopColor: colors.border }]}>
        <Text variant="label" style={{ flex: 1 }}>
          {t('checkout.total')}
        </Text>
        <Text variant="label" aria-label={t('checkout.totalIs', { amount: formatNpr(q.totalPaisa, locale) })}>
          {formatNpr(q.totalPaisa, locale)}
        </Text>
      </View>
      {q.tax && q.tax.inclusive
        ? row(t('checkout.vatIncluded', { rate }), formatNpr(q.tax.paisa, locale), { muted: true })
        : null}
    </View>
  );
}

/** "Have a coupon?": the server checks the code; the reason is shown when it does not apply. */
function CouponBox({
  applied,
  onApplied,
  item,
  alreadyHaveKey,
  linkError,
}: {
  applied: string | null;
  onApplied: (code: string | null) => void;
  item: CheckoutItem;
  alreadyHaveKey: MessageKey;
  linkError: string | null;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const [open, setOpen] = useState(Boolean(linkError));
  const [code, setCode] = useState('');
  const apply = useApplyCoupon(item);

  if (applied) {
    return (
      <View style={[styles.applied, { backgroundColor: colors.successSoft }]}>
        <TicketPercent size={18} color={colors.success} strokeWidth={1.75} aria-hidden />
        <Text variant="bodySm" style={{ flex: 1, color: colors.success }}>
          {t('checkout.couponApplied', { code: applied })}
        </Text>
        <Pressable
          role="button"
          aria-label={t('checkout.removeCoupon')}
          onPress={() => onApplied(null)}
          hitSlop={12}
        >
          <X size={18} color={colors.success} strokeWidth={2} />
        </Pressable>
      </View>
    );
  }
  if (!open) {
    return (
      <Pressable role="button" onPress={() => setOpen(true)} style={styles.haveCoupon}>
        <TicketPercent size={18} color={colors.link} strokeWidth={1.75} aria-hidden />
        <Text variant="bodySm" style={{ color: colors.link }}>
          {t('checkout.haveCoupon')}
        </Text>
      </Pressable>
    );
  }
  const error = apply.error ? errorText(apply.error, t, alreadyHaveKey) : linkError;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.couponRow}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('checkout.couponLabel')}
            value={code}
            onChangeText={(v) => {
              setCode(v.toUpperCase());
              apply.reset();
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            error={error ?? undefined}
            onSubmitEditing={() =>
              code.trim() && apply.mutate(code.trim(), { onSuccess: () => onApplied(code.trim()) })
            }
          />
        </View>
        <Button
          label={t('checkout.apply')}
          variant="secondary"
          loading={apply.isPending}
          disabled={!code.trim()}
          onPress={() => apply.mutate(code.trim(), { onSuccess: () => onApplied(code.trim()) })}
          style={styles.applyButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lines: { borderTopWidth: 1, paddingTop: 10, marginTop: 4, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  total: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 2 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    minHeight: 56,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  haveCoupon: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start' },
  couponRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  applyButton: { marginTop: 26 },
  applied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
  },
});
