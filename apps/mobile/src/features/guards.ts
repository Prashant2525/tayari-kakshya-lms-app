import { useAppConfig, useMe, useTargetPosts } from '@/api/queries';
import { routeGate } from '@/lib/route-gate';
import { usePrefs } from '@/state/prefs';
import { useSession } from '@/state/session';

/**
 * What the student may see right now (UX only — the API enforces access on every request):
 * signed out → auth; verification required by the CMS, or just signed up → verify;
 * no target post yet and not skipped → onboarding; otherwise the tabs.
 */
export function useGuards() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  const verifyPrompt = useSession((s) => s.verifyPrompt);
  const skipped = usePrefs((s) => s.onboardingSkipped);
  const config = useAppConfig();
  const me = useMe(signedIn);
  const targets = useTargetPosts(signedIn);

  const { mustVerify, needsOnboarding } = routeGate({
    signedIn,
    account: me.data,
    verifyPrompt,
    verificationRequired: config.data?.verification.requiredForLearning === true,
    targetCount: targets.data?.length,
    skippedOnboarding: skipped,
  });
  return {
    signedIn,
    mustVerify,
    needsOnboarding,
    me,
    targets,
    /** Where to go after finishing a step: the first screen the guards allow. */
    next: (needsOnboarding ? '/onboarding' : '/') as '/onboarding' | '/',
  };
}
