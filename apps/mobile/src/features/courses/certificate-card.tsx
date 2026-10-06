import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { Award, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { CourseCertificate } from '@/api/certificates';
import { useT } from '@/i18n/use-t';
import { num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { ProgressBar } from '@/ui/chip';
import { Text } from '@/ui/text';

/** Course page: what the certificate needs and how far the student is, or a link to the one earned (D-049). */
export function CertificateCard({ certificate }: { certificate: CourseCertificate | null | undefined }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  if (!certificate || certificate.earned?.revoked) return null;
  const { earned, progress, requiredPercent } = certificate;
  if (earned) {
    return (
      <Pressable
        role="link"
        aria-label={`${t('cert.courseEarned')} ${t('cert.view')}`}
        onPress={() => router.push('/certificates')}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: pressed ? colors.surfaceMuted : colors.successSoft, borderColor: colors.border },
        ]}
      >
        <Award size={22} color={colors.success} strokeWidth={1.75} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{t('cert.courseEarned')}</Text>
          <Text variant="bodySm" color="link">
            {t('cert.view')}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
      </Pressable>
    );
  }
  if (requiredPercent === null) return null;
  const done = progress.total ? Math.round((progress.completed * 100) / progress.total) : 0;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Award size={22} color={colors.onPrimarySoft} strokeWidth={1.75} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text variant="label">{t('cert.courseTitle')}</Text>
        <Text variant="bodySm" color="textSecondary">
          {t('cert.courseRule', { percent: num(requiredPercent, locale) })}
        </Text>
        <ProgressBar value={done} label={t('cert.courseTitle')} />
        <Text variant="caption" color="textMuted">
          {t('cert.courseProgress', {
            completed: num(progress.completed, locale),
            total: num(progress.total, locale),
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
