import { radius } from '@tk/design-tokens';
import { ChevronRight, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useExamNodes, useMe, useSetTargetPosts, useTargetPosts, type ExamNodeView } from '@/api/queries';
import { localized, type Locale } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { initialsOf } from '@/lib/names';
import { useLeaveWhen } from '@/lib/use-leave';
import { usePrefs } from '@/state/prefs';
import { fontFamilies, useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { BackButton, Banner, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/**
 * Onboarding (S1): pick the exam you are preparing for. The organisations and posts are CMS data (D-007);
 * the student drills down level by level and chooses one. Also reached from Home/Profile → Change.
 */
export default function OnboardingScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const me = useMe();
  const current = useTargetPosts();
  const save = useSetTargetPosts();
  const roots = useExamNodes(null);
  const [rootId, setRootId] = useState<string | null>(null);
  const [trail, setTrail] = useState<ExamNodeView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const changing = (current.data?.length ?? 0) > 0;
  const chosen = selected ?? current.data?.[0]?.id ?? null;
  const activeRoot =
    roots.data?.find((r) => r.id === (rootId ?? current.data?.[0]?.path[0]?.id)) ?? roots.data?.[0];
  const parent = trail.at(-1) ?? activeRoot;
  const children = useExamNodes(parent && parent.childCount > 0 ? parent.id : null);
  // A root without children is itself the choice.
  const options = parent && parent.childCount === 0 ? [parent] : (children.data ?? []);
  const needle = query.trim().toLowerCase();
  const filtered = options.filter((n) => localized(n.name, locale).toLowerCase().includes(needle));

  const skipped = usePrefs((s) => s.onboardingSkipped.includes(me.data?.id ?? ''));
  const finish = useLeaveWhen((current.data?.length ?? 0) > 0 || skipped);
  const skip = () => {
    if (me.data) usePrefs.getState().skipOnboarding(me.data.id);
    finish();
  };
  const submit = () => {
    if (!chosen) return;
    setFormError(null);
    save.mutate([chosen], { onSuccess: finish, onError: (e) => setFormError(t(errorMessageKey(e))) });
  };

  const loading = roots.isPending || (parent && parent.childCount > 0 && children.isPending);
  return (
    <Screen
      background="bg"
      contentStyle={styles.content}
      footer={
        <Button label={t('common.continue')} disabled={!chosen} loading={save.isPending} onPress={submit} />
      }
    >
      <View style={styles.top}>
        {changing ? <BackButton /> : <View />}
        {!changing ? (
          <Pressable role="button" onPress={skip} style={styles.skip} hitSlop={8}>
            <Text variant="label" color="link" style={{ fontSize: 16 }}>
              {t('common.skip')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View>
        <Text variant="h2" role="heading">
          {t('onboarding.title')}
        </Text>
        <Text variant="body" color="textSecondary">
          {t('onboarding.subtitle')}
        </Text>
      </View>
      {formError ? <Banner message={formError} /> : null}

      {roots.isError ? (
        <ErrorState error={roots.error} onRetry={() => void roots.refetch()} />
      ) : roots.data && roots.data.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t('onboarding.empty')}
          action={<Button label={t('common.continue')} variant="secondary" onPress={skip} />}
        />
      ) : (
        <>
          <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Search size={20} color={colors.textMuted} strokeWidth={1.75} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('onboarding.search')}
              placeholderTextColor={colors.textMuted}
              aria-label={t('onboarding.search')}
              style={[styles.searchInput, { color: colors.text }]}
            />
          </View>
          <ScrollView
            horizontal
            style={styles.chipRow}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            role="tablist"
          >
            {(roots.data ?? []).map((r) => {
              const active = r.id === activeRoot?.id;
              return (
                <Pressable
                  key={r.id}
                  role="tab"
                  aria-selected={active}
                  onPress={() => {
                    setRootId(r.id);
                    setTrail([]);
                  }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primarySoft : colors.surface,
                      borderColor: active ? colors.primary : colors.borderStrong,
                    },
                  ]}
                >
                  <Text variant="label" color={active ? 'onPrimarySoft' : 'text'}>
                    {localized(r.name, locale)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {trail.length > 0 ? (
            <Pressable role="button" onPress={() => setTrail((x) => x.slice(0, -1))} style={styles.crumb}>
              <Text variant="label" color="link">
                ‹ {localized((trail.at(-2) ?? activeRoot)?.name, locale)}
              </Text>
            </Pressable>
          ) : null}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} role="radiogroup">
            {loading
              ? [0, 1, 2].map((i) => <Skeleton key={i} height={76} style={{ borderRadius: radius.lg }} />)
              : filtered.map((node) => (
                  <NodeRow
                    key={node.id}
                    node={node}
                    locale={locale}
                    selected={node.id === chosen}
                    onPress={() =>
                      node.childCount > 0 && node.id !== parent?.id
                        ? setTrail((x) => [...x, node])
                        : setSelected(node.id)
                    }
                  />
                ))}
          </ScrollView>
        </>
      )}
    </Screen>
  );
}

function NodeRow({
  node,
  locale,
  selected,
  onPress,
}: {
  node: ExamNodeView;
  locale: Locale;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const name = localized(node.name, locale);
  const drill = node.childCount > 0;
  return (
    <Pressable
      role={drill ? 'button' : 'radio'}
      aria-checked={drill ? undefined : selected}
      aria-label={name}
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      {node.iconUrl ? (
        <Image source={{ uri: node.iconUrl }} style={styles.tile} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.tile, { backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted }]}>
          <Text variant="h4" weight={700} color={selected ? 'onPrimarySoft' : 'textSecondary'}>
            {initialsOf(name)}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text variant="h4">{name}</Text>
        {node.description ? (
          <Text variant="bodySm" color="textSecondary" numberOfLines={2}>
            {localized(node.description, locale)}
          </Text>
        ) : drill ? (
          <Text variant="bodySm" color="textSecondary">
            {t('onboarding.more', { count: node.childCount })}
          </Text>
        ) : null}
      </View>
      {drill ? (
        <ChevronRight size={20} color={colors.textMuted} strokeWidth={1.75} />
      ) : (
        <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.borderStrong }]}>
          {selected ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingTop: 8 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontFamily: fontFamilies[400], fontSize: 16, minHeight: 44 },
  chipRow: { flexGrow: 0 },
  chips: { gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  crumb: { minHeight: 36, justifyContent: 'center' },
  list: { gap: 10, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg },
  tile: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
