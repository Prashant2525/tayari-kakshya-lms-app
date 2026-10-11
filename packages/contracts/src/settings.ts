import { z } from 'zod';
import { LocalizedText } from './common.js';
import { QuestionType } from './questions.js';

/** Email text in both languages (both required: the student's language picks one). */
const EmailText = (max: number) =>
  z.object({
    en: z.string().trim().min(1, 'Write the English text').max(max),
    ne: z.string().trim().min(1, 'Write the Nepali text').max(max),
  });

/**
 * Typed registry of CMS-editable system settings. Each key has a schema and a default.
 * Defaults are *technical* starting points, not owner business decisions: values marked
 * "launch checklist" in docs/PROJECT_STATE.md must be set by the owner before go-live.
 */
export const SETTINGS = {
  /** D-028. `maxActiveSessions: null` = no limit enforced yet (launch checklist). */
  'auth.deviceLimit': {
    schema: z.object({
      maxActiveSessions: z.number().int().min(1).max(20).nullable(),
      onLimit: z.enum(['block', 'revoke_oldest']),
    }),
    default: { maxActiveSessions: null, onLimit: 'block' as const },
    public: false,
  },
  /** D-029. Which verification channels students may use; phone needs an SMS provider (L1). */
  'auth.verification': {
    schema: z.object({
      channels: z.object({ email: z.boolean(), phone: z.boolean() }),
      requiredForLearning: z.boolean(),
    }),
    default: { channels: { email: true, phone: false }, requiredForLearning: false },
    public: true,
  },
  /** Staff two-factor authentication policy (ARCHITECTURE §4: required for Super Admins). */
  'auth.staffMfa': {
    schema: z.object({ requiredFor: z.enum(['none', 'super_admins', 'all_staff']) }),
    default: { requiredFor: 'super_admins' as const },
    public: false,
  },
  /** D-032: days between a self-service deletion request and erasure (owner chose 7). */
  'account.deletionGraceDays': {
    schema: z.object({ days: z.number().int().min(1).max(60) }),
    default: { days: 7 },
    public: false,
  },
  /** S24. */
  'app.maintenance': {
    schema: z.object({ enabled: z.boolean(), message: LocalizedText.nullable() }),
    default: { enabled: false, message: null },
    public: true,
  },
  /** S24 force update: semantic versions below these must update. */
  'app.minVersions': {
    schema: z.object({
      android: z
        .string()
        .regex(/^\d+\.\d+\.\d+$/)
        .nullable(),
      ios: z
        .string()
        .regex(/^\d+\.\d+\.\d+$/)
        .nullable(),
    }),
    default: { android: null, ios: null },
    public: true,
  },
  /** S24: where the "Update now" button sends students (Play Store / App Store pages). */
  'app.storeLinks': {
    schema: z.object({
      android: z
        .url({ protocol: /^https$/ })
        .max(500)
        .nullable(),
      ios: z
        .url({ protocol: /^https$/ })
        .max(500)
        .nullable(),
    }),
    default: { android: null, ios: null },
    public: true,
  },
  /** D-027. Purchase channel per platform — switchable without an app release. */
  'purchase.channels': {
    schema: z.object({
      android: z.enum(['in_app', 'web_only', 'disabled']),
      ios: z.enum(['web_only', 'disabled']),
      web: z.enum(['enabled', 'disabled']),
    }),
    default: { android: 'in_app' as const, ios: 'web_only' as const, web: 'enabled' as const },
    public: true,
  },
  /**
   * D-016 / DYNAMIC_ADMIN_AUDIT §4.2: question types the team may author, and optional display names.
   * Turning a type off stops new questions of that type; existing ones keep working.
   */
  'questions.types': {
    schema: z.object({
      enabled: z.array(QuestionType).min(1, 'Keep at least one question type'),
      labels: z.partialRecord(QuestionType, LocalizedText).default({}),
    }),
    default: {
      enabled: [
        'single_choice',
        'multiple_choice',
        'true_false',
        'fill_blank',
        'match',
        'numeric',
        'subjective',
      ] as QuestionType[],
      labels: {},
    },
    public: true,
  },
  /**
   * Prefill for new assessments (D-017 quiz answers: results after submission, explanations shown, unlimited
   * retakes). Scoring choices start unset (null): the admin chooses them per assessment (D-044) until defaults are set
   * here.
   */
  'assessments.defaults': {
    schema: z.object({
      resultRelease: z.enum(['immediate', 'after_close', 'manual']),
      showExplanations: z.boolean(),
      maxAttempts: z.number().int().min(1).max(100).nullable(),
      /** D-048 (owner, 2026-10-04). Defaults keep earlier saved values valid. */
      premiumAccess: z.enum(['linked', 'any_course', 'plans_only']).default('linked'),
      lateStart: z.enum(['until_close', 'full_duration']).default('until_close'),
      countedAttempt: z.enum(['first', 'best', 'latest']).default('first'),
      scoring: z.object({
        negativeMarking: z.boolean().nullable(),
        multipleChoice: z.enum(['all_or_nothing', 'partial_if_no_wrong']).nullable(),
        match: z.enum(['all_or_nothing', 'per_pair']).nullable(),
        fillBlank: z.enum(['all_or_nothing', 'per_blank']).nullable(),
        scoreFloor: z.enum(['none', 'zero']).nullable(),
      }),
    }),
    default: {
      resultRelease: 'immediate' as const,
      showExplanations: true,
      maxAttempts: null,
      premiumAccess: 'linked' as const,
      lateStart: 'until_close' as const,
      countedAttempt: 'first' as const,
      scoring: {
        negativeMarking: null,
        multipleChoice: null,
        match: null,
        fillBlank: null,
        scoreFloor: null,
      },
    },
    public: false,
  },
  /**
   * Attempt timing (§10). Answers that arrive up to `graceSeconds` after an attempt's deadline are still accepted (a
   * slow network must not lose the last answers); after that the attempt is submitted automatically.
   */
  'assessments.timing': {
    schema: z.object({ graceSeconds: z.number().int().min(0).max(300) }),
    default: { graceSeconds: 30 },
    public: false,
  },
  /** D-049: how other students appear on leaderboards (first name + initial by default; or full names; or none). */
  'leaderboards.display': {
    schema: z.object({ names: z.enum(['first_initial', 'full', 'none']) }),
    default: { names: 'first_initial' as const },
    public: false,
  },
  /** D-049: past daily challenges stay open as practice (never counting for the streak or that day's ranking). */
  'dailyChallenge.rules': {
    schema: z.object({ pastAsPractice: z.boolean() }),
    default: { pastAsPractice: true },
    public: false,
  },
  /**
   * Where a certificate can be checked, printed with a QR code on every certificate: `{baseUrl}/{code}` (e.g. the
   * website's verification page). Unset = the PDF shows only the certificate number.
   */
  'certificates.verification': {
    schema: z.object({
      baseUrl: z
        .url({ protocol: /^https$/ })
        .max(300)
        .refine((v) => !v.endsWith('/'), 'Leave out the trailing /')
        .nullable(),
    }),
    default: { baseUrl: null },
    public: false,
  },
  /**
   * D-003: which payment gateways students may use (each also needs its credentials in .env). Turning one off stops
   * new payments through it; payments already started still settle.
   */
  'payments.providers': {
    schema: z.object({ esewa: z.boolean(), khalti: z.boolean() }),
    default: { esewa: true, khalti: true },
    public: false,
  },
  /**
   * D-026, D-055: VAT and the seller's details for receipts. Off until the business is VAT-registered; rate in basis
   * points (13% = 1300); prices typed in the CMS either already include VAT or have it added at checkout. Nepal PAN
   * (which is also the VAT number) has 9 digits.
   */
  'commerce.tax': {
    schema: z
      .object({
        vatRegistered: z.boolean(),
        rateBps: z.number().int().min(0).max(10_000),
        pricesIncludeVat: z.boolean(),
        businessName: z.string().trim().max(200),
        panNumber: z
          .string()
          .trim()
          .regex(/^(\d{9})?$/, 'PAN / VAT number: 9 digits'),
        address: z.string().trim().max(300),
      })
      .superRefine((v, ctx) => {
        if (!v.vatRegistered) return;
        if (v.rateBps <= 0)
          ctx.addIssue({ code: 'custom', path: ['rateBps'], message: 'Enter the VAT rate' });
        if (!v.panNumber) {
          ctx.addIssue({ code: 'custom', path: ['panNumber'], message: 'Enter the PAN / VAT number' });
        }
        if (!v.businessName) {
          ctx.addIssue({
            code: 'custom',
            path: ['businessName'],
            message: 'Enter the registered business name',
          });
        }
      }),
    default: {
      vatRegistered: false,
      rateBps: 1300,
      pricesIncludeVat: true,
      businessName: '',
      panNumber: '',
      address: '',
    },
    public: false,
  },
  /**
   * D-026, D-057: receipt numbers, e.g. TK-2083/84-000001 — the prefix, then (when it restarts each Nepali fiscal
   * year, 1 Shrawan) the fiscal year, then a running number.
   */
  'commerce.receipts': {
    schema: z.object({
      prefix: z
        .string()
        .trim()
        .regex(/^[A-Z0-9]{1,10}$/, 'Prefix: 1–10 capital letters or digits'),
      resetEachFiscalYear: z.boolean(),
    }),
    default: { prefix: 'TK', resetEachFiscalYear: true },
    public: false,
  },
  /**
   * D-058, D-059: the referral programme. Off until staff switch it on and set both discounts. The friend's discount
   * applies to their first purchase (the bigger of it and a coupon, never both); the referrer's reward is a one-time
   * coupon only they can use, valid for `validDays`.
   */
  'referrals.rules': {
    schema: z
      .object({
        enabled: z.boolean(),
        friendDiscount: z.object({
          type: z.enum(['percent', 'fixed']),
          percentBps: z.number().int().min(1).max(10_000).nullable(),
          amountPaisa: z.number().int().min(1).max(100_000_000).nullable(),
          maxDiscountPaisa: z.number().int().min(1).max(100_000_000).nullable(),
          /** As for coupons (D-054): off = no referral discount while a sale price applies. */
          allowOnSale: z.boolean(),
        }),
        reward: z.object({
          type: z.enum(['percent', 'fixed']),
          percentBps: z.number().int().min(1).max(10_000).nullable(),
          amountPaisa: z.number().int().min(1).max(100_000_000).nullable(),
          maxDiscountPaisa: z.number().int().min(1).max(100_000_000).nullable(),
          validDays: z.number().int().min(1).max(3650).nullable(),
          allowOnSale: z.boolean(),
        }),
      })
      .superRefine((v, ctx) => {
        if (!v.enabled) return;
        for (const part of ['friendDiscount', 'reward'] as const) {
          const d = v[part];
          if (d.type === 'percent' && d.percentBps === null) {
            ctx.addIssue({ code: 'custom', path: [part, 'percentBps'], message: 'Enter the percentage' });
          }
          if (d.type === 'fixed' && d.amountPaisa === null) {
            ctx.addIssue({ code: 'custom', path: [part, 'amountPaisa'], message: 'Enter the amount' });
          }
        }
        if (v.reward.validDays === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['reward', 'validDays'],
            message: 'Enter how many days the reward lasts',
          });
        }
      }),
    default: {
      enabled: false,
      friendDiscount: {
        type: 'percent',
        percentBps: null,
        amountPaisa: null,
        maxDiscountPaisa: null,
        allowOnSale: false,
      },
      reward: {
        type: 'percent',
        percentBps: null,
        amountPaisa: null,
        maxDiscountPaisa: null,
        validDays: null,
        allowOnSale: false,
      },
    },
    public: false,
  },
  /**
   * D-060: reminders before a scheduled test opens, in minutes (default 1 day and 1 hour), to the students who can
   * take it. Off = none are sent.
   */
  'notifications.examReminders': {
    schema: z.object({
      enabled: z.boolean(),
      minutesBefore: z
        .array(
          z
            .number()
            .int('Whole minutes only')
            .min(5, 'At least 5 minutes before')
            .max(7 * 1440, 'At most 7 days before'),
        )
        .max(3, 'At most 3 reminders')
        .refine((v) => new Set(v).size === v.length, { message: 'Each reminder time once' }),
    }),
    default: { enabled: true, minutesBefore: [1440, 60] },
    public: false,
  },
  /**
   * D-061: the email every new student account gets (from any device), sent outside the app — Apple allows telling
   * users by email where to buy (App Review 3.1.3). `{name}` and `{website}` are filled in. DRAFT text for the owner.
   */
  'emails.welcome': {
    schema: z.object({ enabled: z.boolean(), subject: EmailText(150), body: EmailText(4000) }),
    default: {
      enabled: true,
      subject: { en: 'Welcome to Tayari Kakshya', ne: 'तयारी कक्षामा स्वागत छ' },
      body: {
        en: [
          'Namaste {name},',
          '',
          'Welcome to Tayari Kakshya. Your account is ready: free lessons and practice are open in the app.',
          '',
          'The Tayari Kakshya team',
        ].join('\n'),
        ne: [
          'नमस्ते {name},',
          '',
          'तयारी कक्षामा स्वागत छ। तपाईंको खाता तयार भयो: निःशुल्क पाठ र अभ्यास एपमै खुला छन्।',
          '',
          'तयारी कक्षा टिम',
        ].join('\n'),
      },
    },
    public: false,
  },
  /**
   * D-061: the "how to get courses" box under most student emails (welcome, sign-up verification, notices, course
   * updates, reminders, results, buying links — not security codes or receipts). Emails are outside the app, so they
   * may say where to buy (App Review 3.1.3). `{website}` is filled in. DRAFT text for the owner.
   */
  'emails.buyingGuide': {
    schema: z.object({
      enabled: z.boolean(),
      title: EmailText(80),
      iphone: EmailText(400),
      android: EmailText(400),
      alreadyBought: EmailText(200),
    }),
    default: {
      enabled: true,
      title: { en: 'How to get courses', ne: 'कोर्स कसरी लिने' },
      iphone: {
        en:
          'On iPhone or iPad, courses and plans cannot be bought in the app. Sign in at {website} with the same ' +
          'account you use in the app and buy there: it opens in the app straight away.',
        ne:
          'आइफोन वा आइप्याडको एपबाट कोर्स र प्लान किन्न मिल्दैन। {website} मा एपकै खाताबाट साइन इन गरेर त्यहीँ ' +
          'किन्नुहोस्: एपमा तुरुन्तै खुल्छ।',
      },
      android: {
        en: 'On Android, buy in the app, or on {website}.',
        ne: 'एन्ड्रोइडमा एपबाटै वा {website} बाट किन्न सकिन्छ।',
      },
      alreadyBought: {
        en: 'Already bought a course? You can ignore this.',
        ne: 'कोर्स किनिसक्नुभएको छ भने यो भाग बेवास्ता गर्न सक्नुहुन्छ।',
      },
    },
    public: false,
  },
  /**
   * D-061: the email staff send to a student on an Apple device who opened a course they cannot buy in the app.
   * `{name}`, `{course}` and `{link}` (the course on the website) are filled in; staff can change it before sending.
   */
  'emails.purchaseLink': {
    schema: z.object({
      subject: EmailText(150),
      body: EmailText(4000).refine((v) => v.en.includes('{link}') && v.ne.includes('{link}'), {
        message: 'Keep {link} in both messages (the course on the website)',
      }),
    }),
    default: {
      subject: { en: '{course} on Tayari Kakshya', ne: '{course} — तयारी कक्षा' },
      body: {
        en: [
          'Namaste {name},',
          '',
          'You looked at {course} in the Tayari Kakshya app. You can get it on our website: {link}',
          '',
          'Sign in there with the same account you use in the app; the course opens in the app straight away.',
          '',
          'The Tayari Kakshya team',
        ].join('\n'),
        ne: [
          'नमस्ते {name},',
          '',
          'तपाईंले तयारी कक्षा एपमा {course} हेर्नुभएको थियो। यो कोर्स हाम्रो वेबसाइटबाट लिन सक्नुहुन्छ: {link}',
          '',
          'त्यहाँ एपमा प्रयोग गर्ने खाताबाटै साइन इन गर्नुहोस्; कोर्स एपमा तुरुन्तै खुल्छ।',
          '',
          'तयारी कक्षा टिम',
        ].join('\n'),
      },
    },
    public: false,
  },
  /** D-050: a question leaves the mistake notebook after this many correct revision answers in a row (default 2). */
  'mistakes.revision': {
    schema: z.object({ correctInARow: z.number().int().min(1).max(10) }),
    default: { correctInARow: 2 },
    public: false,
  },
  /**
   * D-066 / T-064: progress analytics. Accuracy counts the last `windowDays` days; a topic is weak below `weakBelow` %
   * and strong from `strongFrom` %, once it has at least `minAnswers` answers.
   */
  'progress.topics': {
    schema: z
      .object({
        windowDays: z.number().int().min(7).max(365),
        minAnswers: z.number().int().min(1).max(100),
        weakBelow: z.number().int().min(1).max(100),
        strongFrom: z.number().int().min(1).max(100),
      })
      .refine((v) => v.weakBelow <= v.strongFrom, {
        message: 'The weak line must not be above the strong line',
        path: ['strongFrom'],
      }),
    default: { windowDays: 90, minAnswers: 5, weakBelow: 50, strongFrom: 80 },
    public: false,
  },
  /**
   * D-066 / T-065: study planner time estimates, used where a lesson's own length is unknown: a note, a PDF page,
   * a video without a recorded length, a test without a time limit.
   */
  'planner.estimates': {
    schema: z.object({
      noteMinutes: z.number().int().min(1).max(240),
      pdfMinutesPerPage: z.number().int().min(1).max(30),
      videoMinutes: z.number().int().min(1).max(240),
      testMinutes: z.number().int().min(1).max(600),
    }),
    default: { noteMinutes: 10, pdfMinutesPerPage: 2, videoMinutes: 15, testMinutes: 30 },
    public: false,
  },
  /**
   * D-066 / T-066: course reviews. A student may review a course they have once they have finished at least
   * `minProgressPercent` % of its lessons; reviewers' names are shown as `names` (like leaderboards).
   */
  'reviews.rules': {
    schema: z.object({
      minProgressPercent: z.number().int().min(0).max(100),
      names: z.enum(['first_initial', 'full', 'none']),
    }),
    default: { minProgressPercent: 20, names: 'first_initial' as const },
    public: false,
  },
} as const satisfies Record<string, { schema: z.ZodType; default: unknown; public: boolean }>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(value: string): value is SettingKey {
  return Object.hasOwn(SETTINGS, value);
}
