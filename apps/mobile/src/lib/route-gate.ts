/**
 * Which step a signed-in student must see (UX only — the API enforces access). Pure, so it is unit-tested.
 *
 * Nothing is decided until the account has loaded: deciding with the account still on its way sent students who had
 * skipped onboarding back to it after a restart whenever their target exams arrived before their account.
 */
export function routeGate(input: {
  signedIn: boolean;
  account: { id: string; emailVerified: boolean; phoneVerified: boolean } | undefined;
  /** Just signed up (verification prompted once), or the CMS requires verification for learning. */
  verifyPrompt: boolean;
  verificationRequired: boolean;
  /** Undefined while loading. */
  targetCount: number | undefined;
  skippedOnboarding: readonly string[];
}): { mustVerify: boolean; needsOnboarding: boolean } {
  const { signedIn, account } = input;
  if (!signedIn || !account) return { mustVerify: false, needsOnboarding: false };
  const verified = account.emailVerified || account.phoneVerified;
  const mustVerify = !verified && (input.verifyPrompt || input.verificationRequired);
  const needsOnboarding =
    !mustVerify && input.targetCount === 0 && !input.skippedOnboarding.includes(account.id);
  return { mustVerify, needsOnboarding };
}
