import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useResetPassword } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { checkCode, checkPassword, hasErrors, type FieldErrors } from '@/lib/validation';
import { Button } from '@/ui/button';
import { BackButton, Banner, Screen } from '@/ui/layout';
import { OtpInput } from '@/ui/otp-input';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

type Field = 'code' | 'password';

export default function ResetPasswordScreen() {
  const { t } = useT();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const reset = useResetPassword();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (!email) return <Redirect href="/forgot-password" />;

  const submit = () => {
    const next: FieldErrors<Field> = { code: checkCode(code), password: checkPassword(password) };
    setErrors(next);
    setFormError(null);
    if (hasErrors(next)) return;
    reset.mutate(
      { email, code, newPassword: password },
      {
        // All sessions are revoked by the reset; the student signs in again.
        onSuccess: () => router.replace({ pathname: '/login', params: { reset: '1' } }),
        onError: (e) => setFormError(t(errorMessageKey(e))),
      },
    );
  };

  return (
    <Screen scroll background="surface" contentStyle={styles.content}>
      <View style={styles.top}>
        <BackButton />
      </View>
      <View>
        <Text variant="h1" role="heading">
          {t('auth.reset.title')}
        </Text>
        <Text variant="body" color="textSecondary">
          {t('auth.reset.subtitle', { email })}
        </Text>
      </View>
      {formError ? <Banner message={formError} /> : null}
      <OtpInput value={code} onChange={setCode} error={errors.code && t(errors.code)} />
      <TextField
        label={t('auth.newPassword')}
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="new-password"
        textContentType="newPassword"
        hint={t('auth.passwordHint')}
        error={errors.password && t(errors.password)}
      />
      <Button label={t('auth.reset.submit')} loading={reset.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingBottom: 24 },
  top: { paddingTop: 8 },
});
