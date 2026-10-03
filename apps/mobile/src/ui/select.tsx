import { radius } from '@tk/design-tokens';
import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { Button } from './button';
import { Text } from './text';

export interface SelectOption<V extends string | number> {
  value: V;
  label: string;
}

/** A labelled field that opens a list to choose from (DESIGN_SYSTEM §7 "Select / Sheet picker"). */
export function SelectField<V extends string | number>({
  label,
  value,
  options,
  placeholder,
  onChange,
  compact = false,
}: {
  label: string;
  value: V | null;
  options: ReadonlyArray<SelectOption<V>>;
  placeholder: string;
  onChange: (value: V) => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={[{ gap: 6 }, compact && { flex: 1 }]}>
      <Text variant="label">{label}</Text>
      <Pressable
        role="button"
        aria-label={`${label}: ${current?.label ?? placeholder}`}
        aria-haspopup="listbox"
        onPress={() => setOpen(true)}
        style={[styles.field, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]}
      >
        <Text variant="body" color={current ? 'text' : 'textMuted'} style={{ flex: 1 }} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textSecondary} strokeWidth={1.75} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} aria-label={t('common.close')} />
        <View
          role="dialog"
          aria-label={label}
          style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}
        >
          <Text variant="h4" role="heading">
            {label}
          </Text>
          <FlatList
            data={options as SelectOption<V>[]}
            keyExtractor={(o) => String(o.value)}
            role="list"
            initialScrollIndex={Math.max(
              0,
              options.findIndex((o) => o.value === value),
            )}
            getItemLayout={(_, index) => ({ length: 50, offset: 50 * index, index })}
            renderItem={({ item }) => {
              const selected = item.value === value;
              return (
                <Pressable
                  role="option"
                  aria-selected={selected}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={[styles.option, selected && { backgroundColor: colors.primarySoft }]}
                >
                  <Text variant="body" color={selected ? 'onPrimarySoft' : 'text'}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            }}
            style={{ maxHeight: 360 }}
          />
          <Button label={t('common.close')} variant="tertiary" size="md" onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.sm + 2,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,27,61,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  option: { height: 50, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.sm },
});
