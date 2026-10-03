import type { DeviceLimitDetails } from '@tk/contracts';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLogin } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { GoogleButton, googleConfigured } from '@/features/auth/google-button';
import { ApiError } from '@/lib/api-client';
import { bsDate } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { checkEmail, hasErrors, type FieldErrors } from '@/lib/validation';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { LanguageToggle, Wordmark } from '@/ui/brand';
import { Button } from '@/ui/button';
import { Banner, Card, Divider, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

type Field = 'email' | 'password';

export default function LoginScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ reset?: string }>();
  const endedReason = useSession((s) => s.endedReason);
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [limit, setLimit] = useState<DeviceLimitDetails | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);

  // A session that ended on its own (expired, revoked elsewhere) is explained once, then forgotten.
  useEffect(() => () => useSession.getState().clearEndedReason(), []);
  const message = formError ?? (endedReason ? t('error.sessionExpired') : null);

  const submit = (replaceSessionId?: string) => {
    const next: FieldErrors<Field> = {
      email: checkEmail(email),
      password: password ? undefined : 'validation.required',
    };
    setErrors(next);
    setFormError(null);
    useSession.getState().clearEndedReason();
    if (hasErrors(next)) return;
    login.mutate(
      { email, password, ...(replaceSessionId ? { replaceSessionId } : {}) },
      {
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'DEVICE_LIMIT_REACHED') {
            const details = error.details as DeviceLimitDetails;
            setLimit(details);
            setReplaceId(details.sessions[0]?.id ?? null);
            return;
          }
          setFormError(t(errorMessageKey(error)));
        },
      },
    );
  };

  return (
    <Screen scroll background="surface" edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={[styles.band, { backgroundColor: colors.primarySoft }]}>
        <View style={styles.bandTop}>
          <Wordmark />
          <LanguageToggle />
        </View>
        <View>
          <Text variant="h1" role="heading">
            {t('auth.login.title')}
          </Text>
          <Text variant="body" color="textSecondary">
            {t('auth.login.subtitle')}
          </Text>
        </View>
      </View>

      <View style={styles.form}>
        {params.reset ? <Banner tone="success" message={t('auth.reset.done')} /> : null}
        {message ? <Banner message={message} /> : null}

        {limit ? (
          <Card style={{ gap: 12 }}>
            <Text variant="h4" role="heading">
              {t('auth.deviceLimit.title')}
            </Text>
            <Text variant="bodySm" color="textSecondary">
              {t('auth.deviceLimit.body', { count: limit.maxActiveSessions })}
            </Text>
            <View role="radiogroup" aria-label={t('auth.deviceLimit.title')} style={{ gap: 8 }}>
              {limit.sessions.map((s) => {
                const selected = s.id === replaceId;
                return (
                  <Pressable
                    key={s.id}
                    role="radio"
                    aria-checked={selected}
                    aria-label={s.deviceName}
                    onPress={() => setReplaceId(s.id)}
                    style={[
                      styles.session,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}
                  >
                    <Text variant="label">{s.deviceName}</Text>
                    <Text variant="caption" color="textSecondary">
                      {t('auth.deviceLimit.lastUsed', { date: bsDate(s.lastUsedAt, locale) })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button
              label={t('auth.deviceLimit.signOut')}
              disabled={!replaceId}
              loading={login.isPending}
              onPress={() => replaceId && submit(replaceId)}
            />
            <Button label={t('common.cancel')} variant="tertiary" size="md" onPress={() => setLimit(null)} />
          </Card>
        ) : (
          <>
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
            <View style={{ gap: 4 }}>
              <TextField
                label={t('auth.password')}
                value={password}
                onChangeText={setPassword}
                password
                autoComplete="current-password"
                textContentType="password"
                onSubmitEditing={() => submit()}
                error={errors.password && t(errors.password)}
              />
              <Link href="/forgot-password" asChild>
                <Pressable role="link" style={styles.forgot}>
                  <Text variant="label" color="link">
                    {t('auth.login.forgot')}
                  </Text>
                </Pressable>
              </Link>
            </View>
            <Button label={t('auth.login.submit')} loading={login.isPending} onPress={() => submit()} />
            {googleConfigured() ? (
              <>
                <Divider label={t('common.or')} />
                <GoogleButton onError={(e) => setFormError(t(errorMessageKey(e)))} />
              </>
            ) : null}
          </>
        )}

        <View style={styles.footer}>
          <Text variant="body" color="textSecondary">
            {t('auth.login.newHere')}
          </Text>
          <Pressable role="link" onPress={() => router.push('/register')} hitSlop={8}>
            <Text variant="label" color="link" style={{ fontSize: 16 }}>
              {t('auth.login.createAccount')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0 },
  band: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 36, gap: 20 },
  bandTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  form: { padding: 24, gap: 16, flex: 1 },
  forgot: { alignSelf: 'flex-end', paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  session: { borderRadius: 12, padding: 12, gap: 2 },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
