import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { OfflineBanner } from './states';
import { Text } from './text';

export interface ScreenProps {
  children: ReactNode;
  /** Scrolls and avoids the keyboard (forms). */
  scroll?: boolean;
  background?: 'bg' | 'surface';
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}

/** Safe area, background and screen padding (20) for every screen. Content is centred to 640 on tablets. */
export function Screen({
  children,
  scroll = false,
  background = 'bg',
  edges = ['top', 'bottom'],
  contentStyle,
  footer,
}: ScreenProps) {
  const { colors } = useTheme();
  const content = <View style={[styles.content, contentStyle]}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: colors[background] }]}>
      <OfflineBanner />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
        {footer ? (
          <View
            style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors[background] }]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function BackButton({ onPress }: { onPress?: () => void }) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Pressable
      role="button"
      aria-label={t('common.back')}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
      style={styles.back}
      hitSlop={4}
    >
      <ArrowLeft size={24} color={colors.text} strokeWidth={1.75} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

/** Inline message for form-level errors and notices. Errors are announced (role=alert). */
export function Banner({
  tone = 'danger',
  message,
}: {
  tone?: 'danger' | 'success' | 'info';
  message: string;
}) {
  const { colors } = useTheme();
  const map = {
    danger: { bg: colors.dangerSoft, fg: 'danger' as const },
    success: { bg: colors.successSoft, fg: 'success' as const },
    info: { bg: colors.primarySoft, fg: 'onPrimarySoft' as const },
  }[tone];
  return (
    <View role={tone === 'danger' ? 'alert' : 'status'} style={[styles.banner, { backgroundColor: map.bg }]}>
      <Text variant="bodySm" color={map.fg} weight={500}>
        {message}
      </Text>
    </View>
  );
}

export function Divider({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.dividerRow}>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
      {label ? (
        <Text variant="bodySm" color="textMuted">
          {label}
        </Text>
      ) : null}
      <View style={[styles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

/** Placeholder block while content loads (no spinners on content screens). */
export function Skeleton({
  height,
  width = '100%',
  style,
}: {
  height: number;
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      style={[{ height, width, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted }, style]}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20 },
  scrollContent: { flexGrow: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingVertical: 12 },
  back: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  banner: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: 1 },
});
