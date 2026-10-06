import { palette, radius } from '@tk/design-tokens';
import { Award } from 'lucide-react-native';
import { FlatList, Linking, Platform, Share, StyleSheet, View } from 'react-native';
import { certificatePdfUrl, useMyCertificates, type MyCertificate } from '@/api/certificates';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Profile → Certificates: one per finished course (D-049, D-050), newest first. */
export default function CertificatesScreen() {
  const { t } = useT();
  const list = useMyCertificates();
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('cert.title')}
        </Text>
      </View>
      {list.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={140} />
          <Skeleton height={140} />
        </View>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={Award} title={t('cert.empty')} body={t('cert.emptyBody')} />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          renderItem={({ item }) => <CertificateCard c={item} />}
        />
      )}
    </Screen>
  );
}

/** Sharing uses the system sheet; browsers without one (most desktops) only get Open. */
const canShare = Platform.OS !== 'web' || typeof globalThis.navigator?.share === 'function';

function CertificateCard({ c }: { c: MyCertificate }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const course = localized(c.course.title, locale);
  const url = certificatePdfUrl(c.code);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.top}>
        <View
          style={[styles.icon, { backgroundColor: c.revoked ? colors.surfaceMuted : palette.blue600 }]}
          aria-hidden
        >
          <Award size={22} color={c.revoked ? colors.textMuted : palette.white} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" numberOfLines={3}>
            {course}
          </Text>
          <Text variant="caption" color="textSecondary">
            {t('cert.issued', { date: bsDate(c.issuedAt, locale) })}
          </Text>
          <Text variant="caption" color="textMuted" selectable>
            {t('cert.number', { code: c.code })}
          </Text>
        </View>
      </View>
      {c.revoked ? (
        <View style={{ gap: 6 }}>
          <StatusChip tone="neutral" label={t('cert.revoked')} />
          <Text variant="bodySm" color="textSecondary">
            {t('cert.revokedBody')}
          </Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            label={t('cert.open')}
            size="md"
            style={{ flex: 1 }}
            onPress={() => void Linking.openURL(url)}
          />
          {canShare ? (
            <Button
              label={t('cert.share')}
              size="md"
              variant="secondary"
              onPress={() =>
                void Share.share({ message: t('cert.shareMessage', { course, code: c.code, url }) }).catch(
                  () => undefined,
                )
              }
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 14 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
});
