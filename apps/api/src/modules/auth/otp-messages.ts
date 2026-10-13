import { toDevanagariDigits } from '@tk/domain';
import type { OtpPurpose } from '../../generated/prisma/client.js';

// Transactional copy only (en/ne). Moved to CMS-managed notification templates in Phase 12.
const COPY = {
  verify_email: {
    en: { subject: 'Verify your email', lead: 'Your Tayari Kakshya verification code is' },
    ne: { subject: 'इमेल प्रमाणीकरण', lead: 'तपाईंको तयारी कक्षा प्रमाणीकरण कोड' },
  },
  verify_phone: {
    en: { subject: 'Verify your phone', lead: 'Your Tayari Kakshya verification code is' },
    ne: { subject: 'फोन प्रमाणीकरण', lead: 'तपाईंको तयारी कक्षा प्रमाणीकरण कोड' },
  },
  reset_password: {
    en: { subject: 'Your password reset code', lead: 'Your Tayari Kakshya password reset code is' },
    ne: { subject: 'पासवर्ड रिसेट कोड', lead: 'तपाईंको तयारी कक्षा पासवर्ड रिसेट कोड' },
  },
  change_email: {
    en: { subject: 'Confirm your new email', lead: 'Your code to confirm this email for Tayari Kakshya is' },
    ne: { subject: 'नयाँ इमेल पुष्टि', lead: 'तयारी कक्षामा यो इमेल पुष्टि गर्ने कोड' },
  },
} as const;

/**
 * A new staff account's first password (KI-013): the same one-time code as a password reset, worded as an invitation
 * — they set their password on the CMS's "Set password" page.
 */
const STAFF_INVITE = {
  en: {
    subject: 'Your Tayari Kakshya admin account',
    lead: 'You have been given a Tayari Kakshya admin (CMS) account. To choose your password, open the CMS "Set password" page and enter this code',
  },
  ne: {
    subject: 'तयारी कक्षा एडमिन खाता',
    lead: 'तपाईंलाई तयारी कक्षा एडमिन (CMS) खाता दिइएको छ। पासवर्ड राख्न CMS को "Set password" पेज खोलेर यो कोड हाल्नुहोस्',
  },
} as const;

export type OtpWording = 'default' | 'staff_invite';

export function otpMessage(
  purpose: OtpPurpose,
  locale: 'en' | 'ne',
  code: string,
  ttlMinutes: number,
  wording: OtpWording = 'default',
) {
  const copy =
    wording === 'staff_invite' && purpose === 'reset_password' ? STAFF_INVITE[locale] : COPY[purpose][locale];
  const text =
    locale === 'ne'
      ? `${copy.lead}: ${code}। यो कोड ${toDevanagariDigits(ttlMinutes)} मिनेटसम्म मान्य छ। कसैलाई नदिनुहोस्।`
      : `${copy.lead}: ${code}. It expires in ${ttlMinutes} minutes. Never share this code.`;
  return { subject: copy.subject, text };
}
