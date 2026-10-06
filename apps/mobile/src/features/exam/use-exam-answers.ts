import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnswerResponseInput } from '@tk/contracts';
import type { AnswerResponse } from '@tk/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { saveAnswers, type AttemptView } from '@/api/assessments';
import { EMPTY_DRAFT, fromResponse, toResponse, type Draft } from '@/features/questions/answer-input';
import { ApiError } from '@/lib/api-client';

export type SaveState = 'saved' | 'saving' | 'offline';

export interface Entry {
  draft: Draft;
  marked: boolean;
}

const storageKey = (attemptId: string) => `tk.attempt.${attemptId}`;
const SAVE_EVERY_MS = 3000;

/**
 * Exam answers with autosave: changes are sent in batches every few seconds and when the app goes to the
 * background. Unsent answers are also kept on the phone, so closing the app or losing the connection never loses
 * them; they are sent when the exam opens again. The server decides what still counts (deadline + grace).
 */
export function useExamAnswers(view: AttemptView | undefined, onClosed: () => void) {
  // What the server has; the student's changes on top.
  const base = useMemo(() => {
    const out: Record<string, Entry> = {};
    for (const s of view?.sections ?? []) {
      for (const q of s.questions) {
        out[q.questionId] = {
          draft: fromResponse(q.response as AnswerResponse | null),
          marked: q.markedForReview,
        };
      }
    }
    return out;
  }, [view]);
  const [changes, setChanges] = useState<Record<string, Entry>>({});
  const entries = useMemo(() => ({ ...base, ...changes }), [base, changes]);
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const latest = useRef(entries);
  const dirty = useRef(new Set<string>());
  const inFlight = useRef<Promise<void> | null>(null);
  const restoredFor = useRef<string | null>(null);
  /** The phone copy has been read back for this attempt; until then it must not be overwritten (KI-039). */
  const readyFor = useRef<string | null>(null);

  // Keep the phone copy of unsent answers in step with every change (once it has been read back).
  useEffect(() => {
    latest.current = entries;
    if (!view || readyFor.current !== view.id) return;
    const unsent = Object.fromEntries([...dirty.current].map((id) => [id, entries[id]]));
    const write = Object.keys(unsent).length
      ? AsyncStorage.setItem(storageKey(view.id), JSON.stringify(unsent))
      : AsyncStorage.removeItem(storageKey(view.id));
    void write.catch(() => undefined);
  }, [entries, view]);

  // Answers this phone had not sent yet (app closed or offline) come back on top of the server's.
  useEffect(() => {
    if (!view || restoredFor.current === view.id) return;
    restoredFor.current = view.id;
    void AsyncStorage.getItem(storageKey(view.id))
      .then((raw) => {
        if (!raw) return;
        const known = Object.entries(JSON.parse(raw) as Record<string, Entry>).filter(([id]) => id in base);
        if (!known.length) return;
        known.forEach(([id]) => dirty.current.add(id));
        setChanges((current) => ({ ...current, ...Object.fromEntries(known) }));
        setSaveState('saving');
      })
      .catch(() => undefined)
      .finally(() => {
        readyFor.current = view.id;
        // Changes made while it was being read are written now.
        if (dirty.current.size) {
          const unsent = Object.fromEntries([...dirty.current].map((id) => [id, latest.current[id]]));
          void AsyncStorage.setItem(storageKey(view.id), JSON.stringify(unsent)).catch(() => undefined);
        }
      });
  }, [view, base]);

  const bodies = useMemo(
    () => new Map((view?.sections ?? []).flatMap((s) => s.questions).map((q) => [q.questionId, q.question])),
    [view],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (!view) return;
    if (inFlight.current) await inFlight.current;
    if (!dirty.current.size) return;
    const ids = [...dirty.current];
    dirty.current.clear();
    setSaveState('saving');
    const run = (async () => {
      try {
        await saveAnswers(
          view.id,
          ids.map((id) => {
            const e = latest.current[id] ?? { draft: EMPTY_DRAFT, marked: false };
            const body = bodies.get(id);
            const response = body ? (toResponse(body, e.draft) as AnswerResponseInput | null) : null;
            return { questionId: id, response, markedForReview: e.marked };
          }),
        );
        setSaveState(dirty.current.size ? 'saving' : 'saved');
        if (!dirty.current.size) await AsyncStorage.removeItem(storageKey(view.id)).catch(() => undefined);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ATTEMPT_CLOSED') {
          dirty.current.clear();
          await AsyncStorage.removeItem(storageKey(view.id)).catch(() => undefined);
          onClosed();
          return;
        }
        // Kept for the next try (they are also stored on the phone).
        ids.forEach((id) => dirty.current.add(id));
        setSaveState('offline');
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [view, bodies, onClosed]);

  const update = useCallback((questionId: string, change: Partial<Entry>) => {
    dirty.current.add(questionId);
    setChanges((current) => {
      const before = current[questionId] ??
        latest.current[questionId] ?? { draft: EMPTY_DRAFT, marked: false };
      return { ...current, [questionId]: { ...before, ...change } };
    });
    setSaveState('saving');
  }, []);

  // Batches every few seconds, and right away when the app goes to the background.
  useEffect(() => {
    const timer = setInterval(() => void flush(), SAVE_EVERY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flush();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [flush]);

  /** Sends everything left; true when the server has all answers. */
  const flushAll = useCallback(async () => {
    await flush();
    return dirty.current.size === 0;
  }, [flush]);

  return { entries, update, saveState, flush, flushAll };
}
