import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useGuards } from '@/features/guards';

/**
 * Leaves a guarded step (verify, onboarding) once the guards no longer require it. The guards only see
 * new state after the next render, so navigation runs in an effect rather than in the event handler.
 */
export function useLeaveWhen(ready: boolean): () => void {
  const { next } = useGuards();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (leaving && ready) router.replace(next);
  }, [leaving, ready, next]);
  return () => setLeaving(true);
}
