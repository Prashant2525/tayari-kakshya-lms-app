import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useMe, useSendVerification, useVerify } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { checkCode, toNepalE164 } from '@/lib/validation';
import type { MessageKey } from '@/i18n/en';
import { Button } from '@/ui/button';
import { BackButton, Banner, Screen } from '@/ui/layout';
import { OtpInput } from '@/ui/otp-input';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

/**
 * Add or change the mobile number (D-029, D-074 / audit F-13): the number becomes the account's once the SMS code is
 * entered. Only offered while the CMS has the phone channel on (it needs an SMS provider).
 */
export default function ChangePhoneScreen() {
  const { t } = useT();
  const me = useMe();
  const send = useSendVerification();
  const verify = useVerify();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<MessageKey | undefined>();

  const sendCode = () => {
    const e164 = toNepalE164(phone);
    setFieldError(e164 ? undefined : 'validation.phone');
    if (!e164) return;
    send.mutate(
      { channel: 'phone', phone: e164 },
      {
        onSuccess: () => {
          setSentTo(e164);
          setCode('');
        },
      },
    );
  };

  const submit = (value = code) => {
    const problem = checkCode(value);
    setFieldError(problem);
    if (problem) return;
    verify.mutate({ channel: 'phone', code: value });
  };

  const error = send.error ?? verify.error;
  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {me.data?.phone ? t('profile.changePhone') : t('profile.addPhone')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {verify.isSuccess ? (
          <Banner tone="success" message={t('profile.phoneSaved')} />
        ) : (
          <>
            {error ? <Banner message={t(errorMessageKey(error))} /> : null}
            {sentTo ? (
              <>
                <Text variant="body" color="textSecondary">
                  {t('verify.sentTo', { target: sentTo })}
                </Text>
                <OtpInput
                  value={code}
                  onChange={setCode}
                  onComplete={submit}
                  error={fieldError && t(fieldError)}
                />
                <Button label={t('verify.submit')} loading={verify.isPending} onPress={() => submit()} />
              </>
            ) : (
              <>
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
                <Button label={t('verify.sendCode')} loading={send.isPending} onPress={sendCode} />
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
