import { radius } from '@tk/design-tokens';
import { formatNpr } from '@tk/domain';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCheckout, usePaymentOptions, type ProviderName } from '@/api/commerce';
import { useT } from '@/i18n/use-t';
import type { MessageKey } from '@/i18n/en';
import type { Locale, Translate } from '@/i18n/translate';
import { bsDate } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { ApiError } from '@/lib/api-client';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Banner, Card, Screen, Skeleton } from '@/ui/layout';
import { Text } from '@/ui/text';

const PROVIDER_LABEL: Record<ProviderName, string> = { esewa: 'eSewa', khalti: 'Khalti' };

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

/**
 * Checkout (Phase 11) for a course or a plan: what is bought and its price as the server sets them, a gateway to pay
 * with, then the gateway's own page. Access comes only from the server's confirmation (the result screen waits for it).
 */
export function CheckoutView({
  loading,
  title,
  validity,
  price,
  totalPaisa,
  item,
  alreadyHaveKey,
  note,
}: {
  loading: boolean;
  title: string;
  validity: string;
  price: ReactNode;
  /** Null where this platform does not sell. */
  totalPaisa: number | null;
  item: { courseId: string } | { planId: string } | null;
  alreadyHaveKey: MessageKey;
  note?: string;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const options = usePaymentOptions();
  const checkout = useCheckout();
  const [chosen, setChosen] = useState<ProviderName | null>(null);
  const providers = options.data?.providers ?? [];
  const provider = chosen ?? providers[0]?.provider ?? null;

  if (loading || options.isPending) {
    return (
      <Screen edges={['top']} contentStyle={styles.content}>
        <Skeleton height={140} />
        <Skeleton height={120} />
      </Screen>
    );
  }
  const total = item ? totalPaisa : null;

  const pay = () => {
    if (!provider || !item) return;
    // The app's own return link (tayarikakshya://… in builds, exp://… in Expo Go); reaching it closes the browser.
    const appReturnUrl = Linking.createURL('payment-result');
    checkout.mutate(
      { item, provider, returnTo: Platform.OS === 'web' ? 'web' : 'app', appReturnUrl },
      {
        onSuccess: async ({ order, redirectUrl }) => {
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
  const reason =
    checkout.error instanceof ApiError && checkout.error.code === 'PURCHASE_NOT_AVAILABLE'
      ? (checkout.error.details as { reason?: string } | undefined)?.reason
      : undefined;

  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('checkout.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ gap: 14 }}>
        <Card style={{ gap: 8 }}>
          <Text variant="h4">{title}</Text>
          <Text variant="bodySm" color="textSecondary">
            {validity}
          </Text>
          {note ? (
            <Text variant="caption" color="textSecondary">
              {note}
            </Text>
          ) : null}
          <View style={[styles.total, { borderTopColor: colors.border }]}>
            <Text variant="label">{t('checkout.total')}</Text>
            {price}
          </View>
        </Card>

        {providers.length === 0 || total === null ? (
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
                      style={[styles.radio, { borderColor: selected ? colors.primary : colors.borderStrong }]}
                      aria-hidden
                    >
                      {selected ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
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
        {checkout.error ? (
          <Banner
            message={reason === 'already_has_access' ? t(alreadyHaveKey) : t(errorMessageKey(checkout.error))}
          />
        ) : null}
      </ScrollView>
      {providers.length && total !== null ? (
        <Button
          label={t('checkout.pay', { amount: formatNpr(total, locale) })}
          loading={checkout.isPending}
          onPress={pay}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
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
});
