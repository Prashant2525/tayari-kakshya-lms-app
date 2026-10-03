import { radius } from '@tk/design-tokens';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useReportQuestion, type ReportReason } from '@/api/learning';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Banner } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

const REASONS: ReportReason[] = ['wrong_answer', 'typo', 'unclear', 'outdated', 'other'];

/** Report a problem with a practice question; the content team resolves it in the CMS (Question reports). */
export function ReportSheet({
  questionId,
  visible,
  onClose,
}: {
  questionId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const report = useReportQuestion(questionId);
  const [reason, setReason] = useState<ReportReason>('wrong_answer');
  const [message, setMessage] = useState('');
  const close = () => {
    report.reset();
    setMessage('');
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} aria-label={t('common.close')} />
      <View
        role="dialog"
        aria-label={t('report.title')}
        style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}
      >
        <Text variant="h4" role="heading">
          {t('report.title')}
        </Text>
        {report.isSuccess ? (
          <>
            <Banner tone="success" message={t('report.thanks')} />
            <Button label={t('common.close')} variant="secondary" size="md" onPress={close} />
          </>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            <View role="radiogroup" aria-label={t('report.title')} style={{ gap: 8 }}>
              {REASONS.map((r) => {
                const selected = r === reason;
                return (
                  <Pressable
                    key={r}
                    role="radio"
                    aria-checked={selected}
                    aria-label={t(`report.${r}`)}
                    onPress={() => setReason(r)}
                    style={[
                      styles.option,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}
                  >
                    <Text variant="body">{t(`report.${r}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextField
              label={t('report.message')}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={1000}
            />
            {report.isError ? <Banner message={t(errorMessageKey(report.error))} /> : null}
            <Button
              label={t('report.send')}
              loading={report.isPending}
              onPress={() => report.mutate({ reason, message: message.trim() || null })}
            />
            <Button label={t('common.cancel')} variant="tertiary" size="md" onPress={close} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: '85%',
    padding: 20,
    paddingBottom: 32,
    gap: 12,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  option: { padding: 14, borderRadius: radius.md, minHeight: 48, justifyContent: 'center' },
});
