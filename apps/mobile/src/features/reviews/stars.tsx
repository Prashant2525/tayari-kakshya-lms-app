import { Star } from 'lucide-react-native';
import { View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/text';

/** Five stars, filled up to `rating` (rounded to the nearest whole star). Decorative: callers give the text. */
export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const { colors } = useTheme();
  const full = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          color={n <= full ? colors.warning : colors.textMuted}
          fill={n <= full ? colors.warning : 'transparent'}
          strokeWidth={1.75}
        />
      ))}
    </View>
  );
}

/** "★★★★☆ 4.5 (12)" for course cards and the course page; nothing until a review is approved. */
export function RatingLine({ rating }: { rating: { average: number; count: number } | null }) {
  const { t, locale } = useT();
  if (!rating || rating.count === 0) return null;
  const average = num(rating.average, locale);
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      role="img"
      aria-label={
        rating.count === 1
          ? t('reviews.ratedOne', { average })
          : t('reviews.rated', { average, count: num(rating.count, locale) })
      }
    >
      <Stars rating={rating.average} />
      <Text variant="caption" color="textSecondary">
        {average} ({num(rating.count, locale)})
      </Text>
    </View>
  );
}
