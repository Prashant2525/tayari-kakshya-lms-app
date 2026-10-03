import { palette, radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CatalogCourse, MyCourse } from '@/api/learning';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { percent, price } from '@/lib/format';
import { initialsOf } from '@/lib/names';
import { useTheme } from '@/theme/theme';
import { ProgressBar } from '@/ui/chip';
import { Text } from '@/ui/text';

/** CMS artwork, or a branded fallback (subject-coloured pattern + initials) instead of a black block (DESIGN_SYSTEM §2). */
export function CourseArt({
  title,
  uri,
  style,
  size = 'md',
}: {
  title: string;
  uri: string | null;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
}) {
  if (uri) {
    return (
      <View style={[styles.art, style]}>
        <Image source={{ uri }} style={styles.fill} accessibilityIgnoresInvertColors resizeMode="cover" />
      </View>
    );
  }
  return (
    <View style={[styles.art, { backgroundColor: palette.blue500 }, style]} aria-hidden>
      <Text variant={size === 'lg' ? 'display' : 'h3'} weight={700} style={{ color: palette.white }}>
        {initialsOf(title)}
      </Text>
    </View>
  );
}

/** Price line for catalog cards. No price is shown where the API sends none (iOS, D-027). */
export function PriceText({ course }: { course: CatalogCourse }) {
  const { t, locale } = useT();
  if (course.isFree) {
    return (
      <Text variant="label" color="success">
        {t('course.free')}
      </Text>
    );
  }
  if (!course.pricing) return null;
  const sale = course.pricing.salePricePaisa !== null;
  return (
    <View style={styles.priceRow}>
      <Text variant="label">{price(course.pricing.effectivePricePaisa, locale)}</Text>
      {sale ? (
        <Text variant="caption" color="textMuted" style={{ textDecorationLine: 'line-through' }}>
          {price(course.pricing.pricePaisa, locale)}
        </Text>
      ) : null}
    </View>
  );
}

/** Course in a list: artwork, title, short description, price or progress. */
export function CourseRow({ course }: { course: CatalogCourse | MyCourse }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const title = localized(course.title, locale);
  const progress = 'progress' in course ? course.progress : null;
  const pct = progress ? percent(progress.completed, progress.total) : 0;
  return (
    <Pressable
      role="link"
      aria-label={title}
      onPress={() => router.push({ pathname: '/course/[slug]', params: { slug: course.slug } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderColor: colors.border },
      ]}
    >
      <CourseArt title={title} uri={course.thumbnailUrl} style={styles.thumb} />
      <View style={styles.body}>
        <Text variant="h4" numberOfLines={2}>
          {title}
        </Text>
        {course.shortDescription ? (
          <Text variant="bodySm" color="textSecondary" numberOfLines={2}>
            {localized(course.shortDescription, locale)}
          </Text>
        ) : null}
        {progress ? (
          <View style={{ gap: 4 }}>
            <ProgressBar value={pct} label={t('home.percent', { percent: pct })} />
            <Text variant="caption" color="textSecondary">
              {t('home.percent', { percent: pct })}
            </Text>
          </View>
        ) : (
          <PriceText course={course} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  body: { flex: 1, gap: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
});
