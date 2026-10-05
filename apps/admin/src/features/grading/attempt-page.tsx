import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Check } from 'lucide-react';
import { RichTextView } from '@/components/content/rich-text-editor';
import { Badge, Card, ErrorState, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTimeBs, localized } from '@/lib/format';
import {
  ATTEMPT_STATUS_LABEL,
  marksText,
  OUTCOME_LABEL,
  type AnswerKey,
  type AttemptDetail,
  type LocalizedDoc,
  type QuestionBody,
  type Response,
} from '@/lib/grading';
import { QUESTION_TYPE_LABEL } from '@/lib/questions';
import type { JsonNode } from '@/lib/rich-doc';
import { cn } from '@/lib/utils';
import { WrittenAnswer } from './grade-form';

const docOf = (d: LocalizedDoc | null | undefined) =>
  d ? ((d.en ?? d.ne ?? null) as JsonNode | null) : null;

/** One attempt in full: every question with the student's answer, the correct answer, outcome and marks. */
export function AttemptPage() {
  const { attemptId } = useParams({ from: '/app/attempts/$attemptId' });
  const { can } = useAuth();
  const attempt = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => api.get<AttemptDetail>(`/admin/attempts/${attemptId}`),
  });
  if (attempt.isPending) return <Spinner />;
  if (attempt.isError) return <ErrorState error={attempt.error} onRetry={() => void attempt.refetch()} />;
  const t = attempt.data;
  const canGrade = can('grading:manage') && t.status !== 'in_progress';
  return (
    <>
      <Link
        to="/assessments/$assessmentId/results"
        params={{ assessmentId: t.assessment.id }}
        className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden /> {localized(t.assessment.title)} · Results
      </Link>
      <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
        {t.student.fullName} · attempt {t.attemptNo}
      </h1>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
        <Badge
          tone={t.status === 'pending_grading' ? 'warning' : t.status === 'completed' ? 'success' : 'neutral'}
        >
          {ATTEMPT_STATUS_LABEL[t.status]}
        </Badge>
        {t.status !== 'in_progress' ? (
          <span className="font-semibold text-text">
            {marksText(t.score)} / {marksText(t.maxScore)}
          </span>
        ) : null}
        {t.passed !== null ? <span>{t.passed ? 'Passed' : 'Not passed'}</span> : null}
        <span>Submitted {formatDateTimeBs(t.submittedAt)}</span>
        {t.autoSubmitted ? <span>(time ran out)</span> : null}
      </div>

      <div className="flex flex-col gap-4">
        {t.questions.map((q) => (
          <Card key={q.questionId} className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-semibold text-text">Question {q.number}</span>
              <span>{QUESTION_TYPE_LABEL[q.question.type]}</span>
              <span>
                {marksText(q.marks)} marks{q.negativeMarks ? `, −${marksText(q.negativeMarks)} if wrong` : ''}
              </span>
              <span className="flex-1" />
              {q.outcome ? (
                <Badge
                  tone={
                    q.outcome === 'correct'
                      ? 'success'
                      : q.outcome === 'wrong'
                        ? 'danger'
                        : q.outcome === 'pending'
                          ? 'warning'
                          : 'neutral'
                  }
                >
                  {OUTCOME_LABEL[q.outcome]}
                </Badge>
              ) : null}
              {q.awarded !== null ? (
                <span className="font-semibold text-text">{marksText(q.awarded)}</span>
              ) : null}
            </div>
            <div className="mb-4">
              <RichTextView value={docOf(q.question.stem)} label={`Question ${q.number}`} />
            </div>
            {q.question.type === 'subjective' ? (
              q.outcome === 'skipped' ? (
                <p className="text-sm text-text-muted">Not answered.</p>
              ) : canGrade ? (
                <WrittenAnswer
                  key={`${q.awarded}:${q.graderComment}`}
                  attemptId={t.id}
                  questionId={q.questionId}
                  max={q.marks}
                  modelAnswer={q.answer.modelAnswer}
                  text={q.response?.text ?? ''}
                  initialMarks={q.outcome === 'pending' ? null : q.awarded}
                  initialComment={q.graderComment}
                />
              ) : (
                <p className="whitespace-pre-wrap rounded-sm border border-border p-3 text-sm">
                  {q.response?.text ?? '—'}
                </p>
              )
            ) : (
              <Answer body={q.question} answer={q.answer} response={q.response} />
            )}
            {q.gradedBy ? (
              <p className="mt-3 text-xs text-text-muted">
                Marked by {q.gradedBy} · {formatDateTimeBs(q.gradedAt)}
                {q.graderComment ? ` · “${q.graderComment}”` : ''}
              </p>
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}

/** The student's answer next to the key, per question type. */
function Answer({ body, answer, response }: { body: QuestionBody; answer: AnswerKey; response: Response }) {
  if (body.options) {
    const correct = new Set(
      answer.correctOptionIds ?? (answer.correctOptionId ? [answer.correctOptionId] : []),
    );
    const chosen = new Set(response?.optionIds ?? (response?.optionId ? [response.optionId] : []));
    return (
      <ul className="flex flex-col gap-2">
        {body.options.map((o, i) => (
          <li
            key={o.id}
            className={cn(
              'flex items-center gap-3 rounded-sm border p-2 text-sm',
              correct.has(o.id)
                ? 'border-success bg-success-soft'
                : chosen.has(o.id)
                  ? 'border-danger bg-danger-soft'
                  : 'border-border',
            )}
          >
            <span className="w-5 font-semibold">{String.fromCharCode(65 + i)}</span>
            <div className="flex-1">
              <RichTextView value={docOf(o.content)} label={`Option ${String.fromCharCode(65 + i)}`} />
            </div>
            {chosen.has(o.id) ? <Badge>Chosen</Badge> : null}
            {correct.has(o.id) ? <Check className="size-4 text-success" aria-label="Correct" /> : null}
          </li>
        ))}
      </ul>
    );
  }
  const given =
    response === null
      ? 'Not answered'
      : body.type === 'true_false'
        ? response.value === true
          ? 'True'
          : 'False'
        : body.type === 'numeric'
          ? String(response.value ?? '—')
          : body.type === 'fill_blank'
            ? Object.values(response.blanks ?? {}).join(' · ')
            : body.type === 'match'
              ? Object.entries(response.pairs ?? {})
                  .map(([l, r]) => `${l} → ${r}`)
                  .join(' · ')
              : '';
  const key =
    body.type === 'true_false'
      ? answer.correct
        ? 'True'
        : 'False'
      : body.type === 'numeric'
        ? `${answer.value}${answer.tolerance ? ` ± ${answer.tolerance}` : ''}`
        : body.type === 'fill_blank'
          ? (answer.blanks ?? []).map((b) => b.accepted.join(' / ')).join(' · ')
          : body.type === 'match'
            ? Object.entries(answer.pairs ?? {})
                .map(([l, r]) => `${l} → ${r}`)
                .join(' · ')
            : '';
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
      <dt className="text-text-muted">Student's answer</dt>
      <dd className="text-text">{given}</dd>
      <dt className="text-text-muted">Correct answer</dt>
      <dd className="text-success">{key}</dd>
    </dl>
  );
}
