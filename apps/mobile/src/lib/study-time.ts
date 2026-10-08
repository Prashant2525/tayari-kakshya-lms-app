import type { StudyActivity } from '@tk/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from '@/api/client';
import { useSession } from '@/state/session';
import { StudyMeter, type Signal } from './study-meter';

/** Study time (S8, D-066): measured here, sent about once a minute; the server checks it against its own clock. */
const meter = new StudyMeter();
const SEND_EVERY_MS = 60_000;
const MAX_PER_REPORT = 300;

let sending = false;
async function send(): Promise<void> {
  if (sending || !useSession.getState().tokens) return;
  sending = true;
  try {
    for (const { activity, seconds } of meter.drain(Date.now())) {
      for (let left = seconds; left > 0; left -= MAX_PER_REPORT) {
        const part = Math.min(left, MAX_PER_REPORT);
        try {
          await api.post('/me/study-time', { activity, seconds: part });
        } catch {
          // Offline or signed out: keep the time for the next report.
          meter.restore(activity, left);
          return;
        }
      }
    }
  } finally {
    sending = false;
  }
}

let started = false;
/** Starts the clock once: regular reports, background / foreground, and activity on the web. */
export function startStudyClock(): void {
  if (started) return;
  started = true;
  setInterval(() => void send(), SEND_EVERY_MS);
  AppState.addEventListener('change', (state) => {
    const foreground = state === 'active';
    meter.setForeground(foreground, Date.now());
    if (!foreground) void send();
  });
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const mark = () => meter.signal('touch', Date.now());
    for (const type of ['pointerdown', 'keydown', 'wheel', 'scroll']) {
      document.addEventListener(type, mark, { capture: true, passive: true });
    }
  }
}

/** A touch anywhere in the app (root view) or the video player reporting that it plays. */
export function studySignal(kind: Signal): void {
  meter.signal(kind, Date.now());
}

/** Counts time on this screen as `activity` while it is focused (null: not a study screen, or not yet known). */
export function useStudyTime(activity: StudyActivity | null): void {
  useFocusEffect(
    useCallback(() => {
      if (!activity) return;
      const id = meter.open(activity, Date.now());
      return () => {
        meter.close(id, Date.now());
        void send();
      };
    }, [activity]),
  );
}
