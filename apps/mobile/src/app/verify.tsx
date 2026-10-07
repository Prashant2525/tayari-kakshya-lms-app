import { OTP_POLICY } from '@tk/contracts';
import { Mail, MailWarning, Smartphone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { logout, useAppConfig, useMe, useSendVerification, useVerify } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { ApiError } from '@/lib/api-client';
import { countdown } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { checkCode, toNepalE164 } from '@/lib/validation';
import type { MessageKey } from '@/i18n/en';
import { useLeaveWhen } from '@/lib/use-leave';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Banner, Screen } from '@/ui/layout';
import { OtpInput } from '@/ui/otp-input';
import { Segmented } from '@/ui/segmented';
import { EmptyState } from '@/ui/states';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

type Channel = 'email' | 'phone';

/** "aa••••@example.com" — enough to recognise the address on a shared screen. */
function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}••••@${domain}`;
}

/** Account verification by a 6-digit code (D-029): email and/or SMS, as switched on in the CMS. */
export default function VerifyScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const config = useAppConfig();
  const me = useMe();
  const send = useSendVerification();
  const verify = useVerify();
  const channels = config.data?.verification.channels ?? { email: true, phone: false };
  const required = config.data?.verification.requiredForLearning === true;
  const [channel, setChannel] = useState<Channel>(channels.email ? 'email' : 'phone');
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<MessageKey | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const verified = Boolean(me.data?.emailVerified || me.data?.phoneVerified);
  const verifyPrompt = useSession((s) => s.verifyPrompt);
  const leave = useLeaveWhen(!verifyPrompt);
  const done = () => {
    useSession.getState().setVerifyPrompt(false);
    leave();
  };

  const sendCode = () => {
    setFormError(null);
    setFieldError(undefined);
    const e164 = channel === 'phone' ? toNepalE164(phone) : null;
    if (channel === 'phone' && !e164) {
      setFieldError('validation.phone');
      return;
    }
    const target = channel === 'email' ? maskEmail(me.data?.email ?? '') : (e164 as string);
    send.mutate(channel === 'email' ? { channel: 'email' } : { channel: 'phone', phone: e164 as string }, {
      onSuccess: () => {
        setSentTo(target);
        setCode('');
        setSecondsLeft(OTP_POLICY.resendCooldownSeconds);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'OTP_RESEND_TOO_SOON') {
          // A code was sent moments ago: let the student type it, and wait out the remaining time.
          const wait = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 60;
          setSentTo(target);
          setSecondsLeft(wait);
          return;
        }
        setFormError(t(errorMessageKey(error)));
      },
    });
  };

  const submit = (value = code) => {
    const problem = checkCode(value);
    setFieldError(problem);
    setFormError(null);
    if (problem) return;
    verify.mutate(
      { channel, code: value },
      { onSuccess: done, onError: (e) => setFormError(t(errorMessageKey(e))) },
    );
  };

  if (verified) {
    return (
      <Screen background="surface">
        <EmptyState
          icon={Mail}
          title={t('verify.done')}
          action={<Button label={t('common.continue')} onPress={done} style={styles.wide} />}
        />
      </Screen>
    );
  }

  const both = channels.email && channels.phone;
  return (
    <Screen
      scroll
      background="surface"
      contentStyle={styles.content}
      footer={
        required ? (
          <Button label={t('profile.logout')} variant="tertiary" size="md" onPress={() => void logout()} />
        ) : (
          <Button label={t('verify.later')} variant="tertiary" size="md" onPress={done} />
        )
      }
    >
      <View style={{ paddingTop: 24 }}>
        <Text variant="h1" role="heading">
          {t('verify.title')}
        </Text>
        <Text variant="body" color="textSecondary">
          {t('verify.subtitle')}
        </Text>
      </View>
      {both ? (
        <Segmented
          label={t('verify.title')}
          value={channel}
          options={[
            { value: 'email', label: t('verify.email') },
            { value: 'phone', label: t('verify.phone') },
          ]}
          onChange={(c) => {
            setChannel(c);
            setSentTo(null);
            setCode('');
            setFormError(null);
          }}
        />
      ) : null}
      {channels.email ? (
        // D-061: the emails carry account information; neutral wording (no buying pointers in the app, D-027).
        <View
          role="note"
          style={[styles.notice, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}
        >
          <MailWarning size={22} color={colors.text} strokeWidth={1.75} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="body" weight={700}>
              {t('verify.checkEmailTitle')}
            </Text>
            <Text variant="bodySm">{t('verify.checkEmailBody')}</Text>
          </View>
        </View>
      ) : null}
      {!channels.email && !channels.phone ? <Banner message={t('error.channelDisabled')} /> : null}
      {formError ? <Banner message={formError} /> : null}

      {channel === 'phone' && !sentTo ? (
        <TextField
          label={t('verify.phoneLabel')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          hint={t('verify.phoneHint')}
          error={fieldError && t(fieldError)}
        />
      ) : null}

      {sentTo ? (
        <>
          <View style={styles.sent}>
            {channel === 'email' ? (
              <Mail size={18} color={colors.textSecondary} strokeWidth={1.75} />
            ) : (
              <Smartphone size={18} color={colors.textSecondary} strokeWidth={1.75} />
            )}
            <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
              {t('verify.sentTo', { target: sentTo })}
            </Text>
          </View>
          <OtpInput value={code} onChange={setCode} onComplete={submit} error={fieldError && t(fieldError)} />
          {secondsLeft > 0 ? (
            <Text variant="bodySm" color="textSecondary" role="timer">
              {t('verify.resendIn', { time: countdown(secondsLeft, locale) })}
            </Text>
          ) : (
            <Button
              label={t('verify.resend')}
              variant="tertiary"
              size="md"
              loading={send.isPending}
              onPress={sendCode}
              style={styles.start}
            />
          )}
          <Button label={t('verify.submit')} loading={verify.isPending} onPress={() => submit()} />
        </>
      ) : channels.email || channels.phone ? (
        <Button label={t('verify.sendCode')} loading={send.isPending} onPress={sendCode} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingBottom: 24 },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notice: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  start: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  wide: { alignSelf: 'stretch', marginTop: 12 },
});
