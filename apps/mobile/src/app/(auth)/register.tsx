import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppConfig, useRegister } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { GoogleButton, googleConfigured } from '@/features/auth/google-button';
import { ApiError } from '@/lib/api-client';
import { errorMessageKey } from '@/lib/error-message';
import { checkEmail, checkName, checkPassword, hasErrors, type FieldErrors } from '@/lib/validation';
import { LanguageToggle } from '@/ui/brand';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { BackButton, Banner, Divider, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

type Field = 'fullName' | 'email' | 'password' | 'terms' | 'referral';

export default function RegisterScreen() {
  const { t, locale } = useT();
  const register = useRegister();
  const config = useAppConfig();
  // A referral link opens sign-up with the code filled in (D-058); it can only be given here (D-059).
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const [referral, setReferral] = useState(typeof ref === 'string' ? ref.toUpperCase() : '');
  const showReferral = config.data?.referrals?.enabled === true || Boolean(ref);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    const next: FieldErrors<Field> = {
      fullName: checkName(fullName),
      email: checkEmail(email),
      password: checkPassword(password),
      terms: terms ? undefined : 'validation.terms',
      referral:
        !referral.trim() || /^[A-Za-z0-9]{6,12}$/.test(referral.trim()) ? undefined : 'validation.referral',
    };
    setErrors(next);
    setFormError(null);
    if (hasErrors(next)) return;
    register.mutate(
      {
        fullName: fullName.trim(),
        email,
        password,
        locale,
        acceptTerms: true,
        ...(referral.trim() ? { referralCode: referral.trim() } : {}),
      },
      // New accounts are shown verification next by the route guards (session.verifyPrompt).
      {
        onError: (error) =>
          error instanceof ApiError && error.code === 'REFERRAL_CODE_NOT_VALID'
            ? setErrors((e) => ({ ...e, referral: 'error.referralCode' }))
            : setFormError(t(errorMessageKey(error))),
      },
    );
  };

  return (
    <Screen scroll background="surface" contentStyle={styles.content}>
      <View style={styles.top}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))} />
        <LanguageToggle />
      </View>
      <View>
        <Text variant="h1" role="heading">
          {t('auth.register.title')}
        </Text>
        <Text variant="body" color="textSecondary">
          {t('auth.register.subtitle')}
        </Text>
      </View>
      {formError ? <Banner message={formError} /> : null}
      <TextField
        label={t('auth.fullName')}
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        error={errors.fullName && t(errors.fullName)}
      />
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        error={errors.email && t(errors.email)}
      />
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="new-password"
        textContentType="newPassword"
        hint={t('auth.passwordHint')}
        error={errors.password && t(errors.password)}
      />
      {showReferral ? (
        <TextField
          label={t('auth.register.referral')}
          value={referral}
          onChangeText={(v) => setReferral(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          hint={t('auth.register.referralHint')}
          error={errors.referral && t(errors.referral)}
        />
      ) : null}
      <Checkbox
        label={t('auth.register.terms')}
        checked={terms}
        onChange={setTerms}
        error={errors.terms && t(errors.terms)}
      />
      <Button label={t('auth.register.submit')} loading={register.isPending} onPress={submit} />
      {googleConfigured() ? (
        <>
          <Divider label={t('common.or')} />
          <GoogleButton
            onError={(e) => setFormError(t(errorMessageKey(e)))}
            referralCode={referral.trim() || undefined}
          />
        </>
      ) : null}
      <View style={styles.footer}>
        <Text variant="body" color="textSecondary">
          {t('auth.register.haveAccount')}
        </Text>
        <Pressable role="link" onPress={() => router.replace('/login')} hitSlop={8}>
          <Text variant="label" color="link" style={{ fontSize: 16 }}>
            {t('auth.register.login')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 24 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  footer: { flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' },
});
