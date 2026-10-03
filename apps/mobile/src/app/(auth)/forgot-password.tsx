import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useForgotPassword } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { checkEmail } from '@/lib/validation';
import type { MessageKey } from '@/i18n/en';
import { Button } from '@/ui/button';
import { BackButton, Banner, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

export default function ForgotPasswordScreen() {
  const { t } = useT();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<MessageKey | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    const problem = checkEmail(email);
    setError(problem);
    setFormError(null);
    if (problem) return;
    // The API answers the same way whether or not the email has an account (no account enumeration).
    forgot.mutate(
      { email },
      {
        onSuccess: () =>
          router.push({ pathname: '/reset-password', params: { email: email.trim().toLowerCase() } }),
        onError: (e) => setFormError(t(errorMessageKey(e))),
      },
    );
  };

  return (
    <Screen scroll background="surface" contentStyle={styles.content}>
      <View style={styles.top}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))} />
      </View>
      <View>
        <Text variant="h1" role="heading">
          {t('auth.forgot.title')}
        </Text>
        <Text variant="body" color="textSecondary">
          {t('auth.forgot.subtitle')}
        </Text>
      </View>
      {formError ? <Banner message={formError} /> : null}
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        onSubmitEditing={submit}
        error={error && t(error)}
      />
      <Button label={t('auth.forgot.submit')} loading={forgot.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingBottom: 24 },
  top: { paddingTop: 8 },
});
