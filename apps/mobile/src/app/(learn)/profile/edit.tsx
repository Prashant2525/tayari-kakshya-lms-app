import {
  BS_MAX_YEAR,
  BS_MIN_YEAR,
  BS_MONTH_NAMES,
  daysInBsMonth,
  instantToBs,
  toDevanagariDigits,
} from '@tk/domain';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { MeView } from '@tk/contracts';
import { useEducationLevels } from '@/api/account';
import { useMe, useUpdateMe } from '@/api/queries';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { adIsoToBs, bsToAdIso } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { checkName } from '@/lib/validation';
import type { MessageKey } from '@/i18n/en';
import { Button } from '@/ui/button';
import { BackButton, Banner, Screen } from '@/ui/layout';
import { SelectField } from '@/ui/select';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'] as const;
type Gender = (typeof GENDERS)[number];

/** Edit profile: name, date of birth picked in BS (stored in AD, D-009), gender and education level (CMS list). */
export default function EditProfileScreen() {
  const { t } = useT();
  const me = useMe();
  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('profile.edit')}
        </Text>
      </View>
      {me.data ? <ProfileForm me={me.data} /> : null}
    </Screen>
  );
}

/** The form starts from the account as loaded; it is mounted only once the account is known. */
function ProfileForm({ me }: { me: MeView }) {
  const { t, locale } = useT();
  const levels = useEducationLevels();
  const update = useUpdateMe();
  const initialDob = me.dob ? adIsoToBs(me.dob) : null;
  const [fullName, setFullName] = useState(me.fullName);
  const [year, setYear] = useState<number | null>(initialDob?.year ?? null);
  const [month, setMonth] = useState<number | null>(initialDob?.month ?? null);
  const [day, setDay] = useState<number | null>(initialDob?.day ?? null);
  const [gender, setGender] = useState<Gender | null>((me.gender as Gender | null) ?? null);
  const [level, setLevel] = useState<string | null>(me.educationLevelId);
  const [nameError, setNameError] = useState<MessageKey | undefined>();

  const digits = (n: number) => (locale === 'ne' ? toDevanagariDigits(n) : String(n));
  const thisYear = instantToBs(new Date()).year;
  const years = Array.from(
    { length: Math.min(thisYear, BS_MAX_YEAR) - BS_MIN_YEAR + 1 },
    (_, i) => thisYear - i,
  ).map((y) => ({ value: y, label: digits(y) }));
  const months = BS_MONTH_NAMES[locale].map((name, i) => ({ value: i + 1, label: name }));
  const dayCount = year && month ? daysInBsMonth(year, month) : 32;
  const days = Array.from({ length: dayCount }, (_, i) => ({ value: i + 1, label: digits(i + 1) }));
  const dobComplete = year !== null && month !== null && day !== null;

  const save = () => {
    const problem = checkName(fullName);
    setNameError(problem);
    if (problem) return;
    update.mutate({
      fullName: fullName.trim(),
      dob: dobComplete ? bsToAdIso({ year, month, day: Math.min(day, dayCount) }) : null,
      gender,
      educationLevelId: level,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      {update.isSuccess ? <Banner tone="success" message={t('profile.saved')} /> : null}
      {update.isError ? <Banner message={t(errorMessageKey(update.error))} /> : null}
      <TextField
        label={t('auth.fullName')}
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        error={nameError && t(nameError)}
      />
      <View style={{ gap: 6 }}>
        <Text variant="label">{t('profile.dob')}</Text>
        <View style={styles.row}>
          <SelectField
            compact
            label={t('profile.year')}
            value={year}
            options={years}
            placeholder="—"
            onChange={setYear}
          />
          <SelectField
            compact
            label={t('profile.month')}
            value={month}
            options={months}
            placeholder="—"
            onChange={setMonth}
          />
          <SelectField
            compact
            label={t('profile.day')}
            value={day}
            options={days}
            placeholder="—"
            onChange={setDay}
          />
        </View>
      </View>
      <SelectField<Gender>
        label={t('profile.gender')}
        value={gender}
        options={GENDERS.map((g) => ({ value: g, label: t(`gender.${g}`) }))}
        placeholder={t('profile.notSet')}
        onChange={setGender}
      />
      <SelectField
        label={t('profile.education')}
        value={level}
        options={(levels.data ?? []).map((l) => ({ value: l.id, label: localized(l.name, locale) }))}
        placeholder={t('profile.notSet')}
        onChange={setLevel}
      />
      <Button label={t('common.save')} loading={update.isPending} onPress={save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  form: { gap: 16, paddingBottom: 24 },
  row: { flexDirection: 'row', gap: 8 },
});
