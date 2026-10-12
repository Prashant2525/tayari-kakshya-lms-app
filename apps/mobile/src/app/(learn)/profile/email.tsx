import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useConfirmEmailChange, useRequestEmailChange } from '@/api/account';
import { useMe } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { checkCode, checkEmail, hasErrors, type FieldErrors } from '@/lib/validation';
import { Button } from '@/ui/button';
import { BackButton, Banner, Screen } from '@/ui/layout';
import { OtpInput } from '@/ui/otp-input';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

type Field = 'email' | 'password' | 'code';

/**
 * Change the sign-in email (D-074 / audit F-13): new address + current password → a code sent to the new address →
 * confirmed. The old address is told about the change.
 */
export default function ChangeEmailScreen() {
  const { t } = useT();
  const me = useMe();
  const request = useRequestEmailChange();
  const confirm = useConfirmEmailChange();
  const hasPassword = me.data?.hasPassword !== false;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});

  const send = () => {
    const found: FieldErrors<Field> = {
      email: checkEmail(email),
      password: hasPassword && !password ? 'validation.required' : undefined,
    };
    setErrors(found);
    if (hasErrors(found)) return;
    const newEmail = email.trim();
    request.mutate(
      { newEmail, ...(hasPassword ? { currentPassword: password } : {}) },
      {
        onSuccess: () => {
          setSentTo(newEmail);
          setCode('');
        },
      },
    );
  };

  const submit = (value = code) => {
    const problem = checkCode(value);
    setErrors({ code: problem });
    if (problem) return;
    confirm.mutate(value);
  };

  const error = request.error ?? confirm.error;
  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('profile.changeEmail')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {confirm.isSuccess ? (
          <Banner tone="success" message={t('profile.emailChanged', { email: sentTo ?? '' })} />
        ) : (
          <>
            {error ? <Banner message={t(errorMessageKey(error))} /> : null}
            {me.data?.email ? (
              <Text variant="body" color="textSecondary">
                {t('profile.currentEmail', { email: me.data.email })}
              </Text>
            ) : null}
            {sentTo ? (
              <>
                <Text variant="body" color="textSecondary">
                  {t('verify.sentTo', { target: sentTo })}
                </Text>
                <OtpInput
                  value={code}
                  onChange={setCode}
                  onComplete={submit}
                  error={errors.code && t(errors.code)}
                />
                <Button label={t('verify.submit')} loading={confirm.isPending} onPress={() => submit()} />
                <Button
                  label={t('profile.useAnotherEmail')}
                  variant="tertiary"
                  size="md"
                  onPress={() => {
                    setSentTo(null);
                    request.reset();
                    confirm.reset();
                  }}
                />
              </>
            ) : (
              <>
                <TextField
                  label={t('profile.newEmail')}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  error={errors.email && t(errors.email)}
                />
                {hasPassword ? (
                  <TextField
                    label={t('password.current')}
                    value={password}
                    onChangeText={setPassword}
                    password
                    autoComplete="current-password"
                    error={errors.password && t(errors.password)}
                  />
                ) : null}
                <Button label={t('verify.sendCode')} loading={request.isPending} onPress={send} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  form: { gap: 16, paddingBottom: 24 },
});
