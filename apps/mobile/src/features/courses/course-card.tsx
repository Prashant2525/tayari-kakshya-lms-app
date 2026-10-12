import { palette, radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CatalogCourse, MyCourse, Pricing } from '@/api/learning';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { percent, price } from '@/lib/format';
import { initialsOf } from '@/lib/names';
import { useSurfaceStyle } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { ProgressBar, StatusChip } from '@/ui/chip';
import { Text } from '@/ui/text';
import { RatingLine } from '@/features/reviews/stars';

/**
 * Fallback artwork colours: brand blues that carry the white initials (amber stays for premium and streaks, green for
 * success — DESIGN_SYSTEM §2-3).
 */
const ART_TONES = [palette.blue600, palette.navy800, palette.blue700, palette.blue500];

/** The same course always gets the same tone. */
export function artTone(title: string): string {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return ART_TONES[hash % ART_TONES.length]!;
}

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
    <View style={[styles.art, { backgroundColor: artTone(title) }, style]} aria-hidden>
      <View style={[styles.ring, styles.ringBig]} />
      <View style={[styles.ring, styles.ringSmall]} />
      <Text variant={size === 'lg' ? 'display' : 'h3'} weight={700} style={{ color: palette.white }}>
        {initialsOf(title)}
      </Text>
    </View>
  );
}

/** Price line for catalog cards. No price is shown where the API sends none (iOS, D-027). */
export function PriceText({ course }: { course: CatalogCourse }) {
  const { t } = useT();
  if (course.isFree) {
    return (
      <Text variant="label" color="success">
        {t('course.free')}
      </Text>
    );
  }
  return <PricingText pricing={course.pricing} />;
}

/** A price as the server sends it, with the regular price struck through during a sale; nothing when none is sent. */
export function PricingText({ pricing }: { pricing: Pricing | null }) {
  const { locale } = useT();
  if (!pricing) return null;
  const sale = pricing.salePricePaisa !== null;
  return (
    <View style={styles.priceRow}>
      <Text variant="label">{price(pricing.effectivePricePaisa, locale)}</Text>
      {sale ? (
        <Text variant="caption" color="textMuted" style={{ textDecorationLine: 'line-through' }}>
          {price(pricing.pricePaisa, locale)}
        </Text>
      ) : null}
    </View>
  );
}

/** Course in a list: artwork, title, short description, price or progress. */
export function CourseRow({ course, owned = false }: { course: CatalogCourse | MyCourse; owned?: boolean }) {
  const surface = useSurfaceStyle();
  const { t, locale } = useT();
  const title = localized(course.title, locale);
  const progress = 'progress' in course ? course.progress : null;
  const pct = progress ? percent(progress.completed, progress.total) : 0;
  return (
    <PressableScale
      role="link"
      aria-label={title}
      onPress={() => router.push({ pathname: '/course/[slug]', params: { slug: course.slug } })}
      style={[styles.row, surface]}
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
        <RatingLine rating={course.rating} />
        {progress ? (
          <View style={{ gap: 4 }}>
            <ProgressBar value={pct} label={t('home.percent', { percent: pct })} />
            <Text variant="caption" color="textSecondary">
              {t('home.percent', { percent: pct })}
            </Text>
          </View>
        ) : owned ? (
          // A course the student already has: never a price (it read as "buy again", Phase 16).
          <StatusChip tone="done" label={t('courses.owned')} />
        ) : (
          <PriceText course={course} />
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.12)' },
  ringBig: { width: '90%', aspectRatio: 1, top: '-38%', right: '-34%' },
  ringSmall: { width: '46%', aspectRatio: 1, bottom: '-16%', left: '-14%' },
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
