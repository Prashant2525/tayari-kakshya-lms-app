import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { RichTextView } from '@/components/content/rich-text-editor';
import { Field, Select } from '@/components/ui/form';
import { Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { formatDateTimeBs, localized, plural } from '@/lib/format';
import type { GradingQueue } from '@/lib/grading';
import type { JsonNode } from '@/lib/rich-doc';
import { WrittenAnswer } from './grade-form';

/** Written answers awaiting marks in instructor-graded assessments, oldest submission first (§10 part 2). */
export function GradingPage() {
  const [assessmentId, setAssessmentId] = useState('');
  const queue = useQuery({
    queryKey: ['grading', assessmentId],
    queryFn: () =>
      api.get<GradingQueue>('/admin/grading', { ...(assessmentId ? { assessmentId } : {}), limit: 20 }),
  });
  return (
    <>
      <PageHeader
        title="Grading"
        description="Written answers from assessments your team marks. Compare with the model answer, give marks and an optional comment."
      />
      {queue.data && queue.data.assessments.length > 1 ? (
        <Field label="Assessment" className="mb-4 sm:max-w-sm">
          {(a) => (
            <Select {...a} value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)}>
              <option value="">All assessments</option>
              {queue.data.assessments.map((x) => (
                <option key={x.id} value={x.id}>
                  {localized(x.title)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      {queue.isPending ? (
        <Spinner />
      ) : queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : queue.data.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to grade"
            description="New written answers appear here when students submit."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            {plural(queue.data.total, 'answer')} waiting
            {queue.data.total > queue.data.data.length
              ? ` — showing the oldest ${queue.data.data.length}`
              : ''}
            .
          </p>
          {queue.data.data.map((item) => (
            <Card key={`${item.attemptId}:${item.questionId}`} className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                <Link
                  to="/assessments/$assessmentId/results"
                  params={{ assessmentId: item.assessment.id }}
                  className="font-semibold text-link"
                >
                  {localized(item.assessment.title)}
                </Link>
                <span>{item.student}</span>
                <span>Submitted {formatDateTimeBs(item.submittedAt)}</span>
                <Link to="/attempts/$attemptId" params={{ attemptId: item.attemptId }} className="text-link">
                  Whole attempt
                </Link>
              </div>
              <div className="mb-4 text-text">
                <RichTextView
                  value={(item.question.stem.en ?? item.question.stem.ne ?? null) as JsonNode | null}
                  label="Question"
                />
              </div>
              <WrittenAnswer
                attemptId={item.attemptId}
                questionId={item.questionId}
                max={item.marks}
                modelAnswer={item.answer.modelAnswer}
                text={item.response?.text ?? ''}
              />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
