import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useChangePassword } from '@/api/account';
import { useMe } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { checkPassword, hasErrors, type FieldErrors } from '@/lib/validation';
import { Button } from '@/ui/button';
import { BackButton, Banner, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

type Field = 'current' | 'next';

/** Change (or, for Google-only accounts, set) the password. Other devices are signed out by the API. */
export default function PasswordScreen() {
  const { t } = useT();
  const me = useMe();
  const change = useChangePassword();
  const hasPassword = me.data?.hasPassword !== false;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});

  const submit = () => {
    const found: FieldErrors<Field> = {
      current: hasPassword && !current ? 'validation.required' : undefined,
      next: checkPassword(next),
    };
    setErrors(found);
    if (hasErrors(found)) return;
    change.mutate(
      { ...(hasPassword ? { currentPassword: current } : {}), newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
        },
      },
    );
  };

  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {hasPassword ? t('profile.changePassword') : t('profile.setPassword')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {change.isSuccess ? <Banner tone="success" message={t('password.done')} /> : null}
        {change.isError ? <Banner message={t(errorMessageKey(change.error))} /> : null}
        {hasPassword ? (
          <TextField
            label={t('password.current')}
            value={current}
            onChangeText={setCurrent}
            password
            autoComplete="current-password"
            error={errors.current && t(errors.current)}
          />
        ) : null}
        <TextField
          label={t('auth.newPassword')}
          value={next}
          onChangeText={setNext}
          password
          autoComplete="new-password"
          hint={t('auth.passwordHint')}
          error={errors.next && t(errors.next)}
        />
        <Button label={t('common.save')} loading={change.isPending} onPress={submit} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  form: { gap: 16, paddingBottom: 24 },
});
