import type { PageSlug } from '@tk/contracts';

/**
 * D-038: first drafts of the static pages, written for the owner to review, complete and approve. They are created as
 * unpublished working copies; publishing is refused while a [[placeholder]] or the DRAFT line remains (see
 * `draftProblems`). English only: the Nepali text is added in the CMS. Not legal advice — the owner should have them
 * checked before launch.
 */

type Block = ['h', string] | ['p', string] | ['ul', string[]];

const text = (t: string) => [{ type: 'text', text: t }];
const doc = (blocks: Block[]) => ({
  type: 'doc',
  content: blocks.map(([kind, value]) =>
    kind === 'h'
      ? { type: 'heading', attrs: { level: 2 }, content: text(value) }
      : kind === 'p'
        ? { type: 'paragraph', content: text(value) }
        : {
            type: 'bulletList',
            content: value.map((item) => ({
              type: 'listItem',
              content: [{ type: 'paragraph', content: text(item) }],
            })),
          },
  ),
});

export const DRAFT_LINE =
  'DRAFT — written for the owner to review (D-038). Replace every [[…]] and delete this line before publishing.';

const DRAFTS: Record<PageSlug, { title: string; blocks: Block[] }> = {
  about: {
    title: 'About us',
    blocks: [
      ['p', DRAFT_LINE],
      [
        'p',
        'Tayari Kakshya helps candidates prepare for Lok Sewa Aayog and other competitive exams in Nepal, with courses, ' +
          'notes, videos, practice questions, tests, current affairs and Gorkhapatra summaries in English and Nepali.',
      ],
      ['h', 'Who we are'],
      [
        'p',
        '[[Business name]] is based in [[city]], Nepal. [[A few lines about the team and the teachers.]]',
      ],
      ['h', 'What you get'],
      [
        'ul',
        [
          'Courses for specific posts and exams, organised by subject, chapter and topic.',
          'Practice questions with answers and explanations, and timed tests with results.',
          'Daily, weekly, monthly and yearly current affairs, and summaries of Gorkhapatra.',
          'Certificates when you finish a course.',
        ],
      ],
      ['h', 'Contact'],
      [
        'p',
        'See Help & support for our phone, WhatsApp and email. Registered address: [[address]]. PAN: [[PAN]].',
      ],
    ],
  },
  terms: {
    title: 'Terms of use',
    blocks: [
      ['p', DRAFT_LINE],
      [
        'p',
        'Last updated: [[date]]. These terms apply to the Tayari Kakshya app and website, run by [[Business name]].',
      ],
      ['h', '1. Your account'],
      [
        'ul',
        [
          'Keep your password private; you are responsible for what is done with your account.',
          'Anyone may create an account. A parent or guardian is responsible for the use of the service by a child.',
          'An account may be used on a limited number of devices at a time, as shown in the app.',
        ],
      ],
      ['h', '2. Courses and access'],
      [
        'ul',
        [
          'Prices are shown before you pay; the price charged is the one confirmed at checkout.',
          'Access lasts for the period shown for the course or plan, and starts when the payment is confirmed.',
          'Payments are made through eSewa or Khalti; we do not see or keep your payment passwords or card details.',
          'Refunds follow our Refund policy.',
        ],
      ],
      ['h', '3. Using the content'],
      [
        'ul',
        [
          'Courses, notes, videos, questions and tests are for your own study.',
          'Do not copy, record, share, sell or publish them, or share your account. Downloaded PDFs carry your name.',
          'We may suspend an account that breaks these rules, without a refund.',
        ],
      ],
      ['h', '4. What we promise and what we do not'],
      [
        'ul',
        [
          'We work to keep the content accurate and the service available, but mistakes and interruptions can happen.',
          'We do not guarantee exam results. We are not part of the Public Service Commission (Lok Sewa Aayog).',
          '[[Limit of liability, as advised by your lawyer.]]',
        ],
      ],
      ['h', '5. Changes and law'],
      [
        'p',
        'We may update these terms; the date above shows the latest version. These terms are governed by the laws of ' +
          'Nepal; [[courts / dispute resolution]].',
      ],
      ['h', '6. Contact'],
      ['p', 'Questions about these terms: [[email]].'],
    ],
  },
  privacy: {
    title: 'Privacy policy',
    blocks: [
      ['p', DRAFT_LINE],
      ['p', 'Last updated: [[date]]. This policy explains what [[Business name]] collects and why.'],
      ['h', 'What we collect'],
      [
        'ul',
        [
          'Account details: your name, email, phone number (if you add it), password (stored scrambled) and profile.',
          'Learning: lessons opened, progress, answers, test attempts and results, bookmarks and your mistake notebook.',
          'Purchases: orders, receipts and the payment reference from eSewa or Khalti (not your payment password).',
          'Devices: the devices you sign in on, and a notification token if you allow notifications.',
          'On iPhone and iPad: which paid courses you open without access, so we can email you where to get them.',
          'Crash reports and anonymous usage statistics that help us fix problems.',
        ],
      ],
      ['h', 'How we use it'],
      [
        'ul',
        [
          'To run your account, give you access to what you bought, show your progress and results, and send receipts.',
          'To send the notifications and emails you chose in your settings (you can turn them off).',
          'To keep the service secure and fix problems.',
        ],
      ],
      ['h', 'Who we share it with'],
      [
        'p',
        'Only the services we use to run Tayari Kakshya: payment gateways (eSewa, Khalti), our email and notification ' +
          'providers, file storage and hosting, crash reporting and analytics. [[List them with their countries.]] We ' +
          'do not sell your data.',
      ],
      ['h', 'Children'],
      [
        'p',
        'Anyone may use Tayari Kakshya. A parent or guardian should help a child create an account and is responsible ' +
          "for the child's use.",
      ],
      ['h', 'Keeping and deleting your data'],
      [
        'p',
        'You can delete your account in the app (Profile). After 7 days your personal details are erased; receipts are ' +
          'kept without your name, as the law requires for financial records.',
      ],
      ['h', 'Contact'],
      ['p', 'Privacy questions: [[email]].'],
    ],
  },
  refund: {
    title: 'Refund policy',
    blocks: [
      ['p', DRAFT_LINE],
      ['p', 'Last updated: [[date]].'],
      ['h', 'How refunds are decided'],
      [
        'p',
        'Each refund request is reviewed by our team. There is no automatic refund period: we consider why you are ' +
          'asking, when you bought, and how much of the course you have used.',
      ],
      ['h', 'Always refunded'],
      [
        'ul',
        [
          'If you were charged twice for the same order.',
          'If you paid but did not get access because of a fault on our side that we cannot fix.',
        ],
      ],
      ['h', 'How to ask'],
      [
        'p',
        'Contact us through Help & support with your order number (it is on your receipt) and the reason. We reply ' +
          'within [[number]] working days.',
      ],
      ['h', 'If a refund is approved'],
      [
        'ul',
        [
          'The money goes back to the account you paid from (eSewa, Khalti) or to your bank, within [[number]] working days.',
          'A full refund ends your access to what the order gave you. A partial refund leaves it in place.',
        ],
      ],
    ],
  },
};

export function pageDraft(slug: PageSlug) {
  const d = DRAFTS[slug];
  return { title: { en: d.title }, body: { en: doc(d.blocks) } };
}
