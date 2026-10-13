import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Account erasure (D-032) must cover every table that holds a student's data. A new table with a user column is
 * either erased in `processDue` or listed here with the reason it is kept (Phase 15) — otherwise this test fails.
 */
const KEPT: Record<string, string> = {
  AccountDeletionRequest: 'the record of the erasure itself',
  AuditLog: 'audit records are never deleted (CLAUDE.md rule 8); they hold ids, not personal data',
  Entitlement: 'what was bought or granted — financial record, kept anonymised (D-032)',
  Order: 'financial record, kept anonymised (D-032)',
  Refund: 'financial record, kept anonymised (D-032)',
  Coupon: "a referral reward coupon — financial record; the owner's account is anonymised",
  Referral: 'commerce record of a referral and its reward',
  ReferralCode: 'the code in a referral record; not personal once the account is anonymised',
  QuestionReport: "kept for the content team; the student's message is cleared",
  // Staff-side columns (the account is a staff member's, or a staff action on a student record).
  MfaRecoveryCode: 'staff only',
  UserRole: 'staff only',
  StaffScope: 'staff only',
  MediaAsset: 'uploaded by staff',
  CourseInstructor: 'staff only',
  InstructorProfile: 'staff only',
  QuestionImport: 'staff only',
  AttemptAnswer: 'graded by staff (the student’s answers go with their attempts)',
  CourseUpdate: 'sent by staff',
  NotificationCampaign: 'written and sent by staff',
  LiveClass: 'taught / created by staff',
};

describe('account erasure coverage (D-032, Phase 15)', () => {
  it('erases or deliberately keeps every table that refers to a user', () => {
    const schema = readFileSync(new URL('../../../prisma/schema.prisma', import.meta.url), 'utf8');
    // Code only: a commented-out line does not count.
    const erasure = readFileSync(new URL('./account-deletion.service.ts', import.meta.url), 'utf8').replace(
      /\/\/.*$/gm,
      '',
    );
    const uncovered: string[] = [];
    for (const [, name, body] of schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
      const refersToUser = /^\s+\w+\s+User\??\s.*@relation/m.test(body!) || /^\s+actorUserId\s/m.test(body!);
      if (!refersToUser || name === 'User') continue;
      const accessor = name![0]!.toLowerCase() + name!.slice(1);
      if (!erasure.includes(`tx.${accessor}.`) && !(name! in KEPT)) uncovered.push(name!);
    }
    expect(uncovered).toEqual([]);
  });
});
