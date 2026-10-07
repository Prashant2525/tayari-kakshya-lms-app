import { radius } from '@tk/design-tokens';
import type { ContactType } from '@tk/contracts';
import {
  ChevronDown,
  ChevronUp,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { contactHref, useContactOptions, useFaqs, type ContactOption, type Faq } from '@/api/support';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

const ICONS: Record<ContactType, LucideIcon> = {
  phone: Phone,
  whatsapp: MessageCircle,
  viber: MessageCircle,
  email: Mail,
  website: Globe,
  facebook: Users,
  address: MapPin,
};

/** Help & support (D-034, D-064): the FAQs, then the ways to reach the team. */
export default function HelpScreen() {
  const { t } = useT();
  const faqs = useFaqs();
  const contacts = useContactOptions();
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h2" role="heading">
          {t('help.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ gap: 20, paddingBottom: 32 }}>
        <View style={{ gap: 10 }}>
          <Text variant="h4" role="heading">
            {t('help.contact')}
          </Text>
          {contacts.isPending ? (
            <Skeleton height={64} />
          ) : contacts.isError ? (
            <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
          ) : contacts.data.length === 0 ? (
            <Text variant="bodySm" color="textSecondary">
              {t('help.noContacts')}
            </Text>
          ) : (
            contacts.data.map((c) => <ContactRow key={c.id} contact={c} />)
          )}
        </View>
        <View style={{ gap: 10 }}>
          <Text variant="h4" role="heading">
            {t('help.faqs')}
          </Text>
          {faqs.isPending ? (
            <Skeleton height={120} />
          ) : faqs.isError ? (
            <ErrorState error={faqs.error} onRetry={() => void faqs.refetch()} />
          ) : faqs.data.length === 0 ? (
            <Text variant="bodySm" color="textSecondary">
              {t('help.noFaqs')}
            </Text>
          ) : (
            faqs.data.map((f) => <FaqItem key={f.id} faq={f} />)
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function ContactRow({ contact: c }: { contact: ContactOption }) {
  const { colors } = useTheme();
  const { locale } = useT();
  const href = contactHref(c);
  const Icon = ICONS[c.type];
  const label = localized(c.label, locale);
  const body = (
    <>
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <Icon size={20} color={colors.onPrimarySoft} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight={600}>
          {label}
        </Text>
        <Text variant="bodySm" color={href ? 'link' : 'textSecondary'}>
          {c.value}
        </Text>
        {c.note ? (
          <Text variant="caption" color="textMuted">
            {localized(c.note, locale)}
          </Text>
        ) : null}
      </View>
    </>
  );
  const style = [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }];
  return href ? (
    <Pressable
      role="link"
      aria-label={`${label}: ${c.value}`}
      onPress={() => void Linking.openURL(href)}
      style={style}
    >
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

function FaqItem({ faq }: { faq: Faq }) {
  const { colors } = useTheme();
  const { locale } = useT();
  const [open, setOpen] = useState(false);
  const question = localized(faq.question, locale);
  return (
    <View style={[styles.faq, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        role="button"
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={styles.question}
      >
        <Text variant="body" weight={600} style={{ flex: 1 }}>
          {question}
        </Text>
        {open ? (
          <ChevronUp size={20} color={colors.textSecondary} strokeWidth={1.75} />
        ) : (
          <ChevronDown size={20} color={colors.textSecondary} strokeWidth={1.75} />
        )}
      </Pressable>
      {open ? (
        <Text variant="bodySm" color="textSecondary" style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          {localized(faq.answer, locale)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
  },
  icon: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  faq: { borderWidth: 1, borderRadius: radius.md },
  question: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
});
