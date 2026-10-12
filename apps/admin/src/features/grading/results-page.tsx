import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, Card, CardHeader, EmptyState, ErrorState, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDuration } from '@/lib/content';
import { formatDateTimeBs, localized, plural } from '@/lib/format';
import { ATTEMPT_STATUS_LABEL, marksText, type AssessmentResults } from '@/lib/grading';

/** Results of one assessment: statistics from each student's official attempt, release, and every attempt. */
export function ResultsPage() {
  const { assessmentId } = useParams({ from: '/app/assessments/$assessmentId/results' });
  const { can } = useAuth();
  const qc = useQueryClient();
  const [releasing, setReleasing] = useState(false);
  const results = useInfiniteQuery({
    queryKey: ['assessment-results', assessmentId],
    queryFn: ({ pageParam }) =>
      api.get<AssessmentResults>(`/admin/assessments/${assessmentId}/attempts`, {
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  if (results.isPending) return <Spinner />;
  if (results.isError) return <ErrorState error={results.error} onRetry={() => void results.refetch()} />;
  const first = results.data.pages[0]!;
  const { assessment: a, stats } = first;
  const rows = results.data.pages.flatMap((p) => p.data);
  const release = async () => {
    await api.post(`/admin/assessments/${assessmentId}/release-results`);
    await qc.invalidateQueries({ queryKey: ['assessment-results', assessmentId] });
    await qc.invalidateQueries({ queryKey: ['assessment-leaderboard', assessmentId] });
    toast.success('Results released');
  };

  return (
    <>
      <Link
        to="/assessments/$assessmentId"
        params={{ assessmentId }}
        className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden /> {localized(a.title)}
      </Link>
      <h1 className="mb-6 text-[26px] font-bold leading-8 tracking-tight text-text">Results</h1>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={String(stats.students)} hint={plural(stats.attempts, 'attempt')} />
        <Stat
          label="Average score"
          value={stats.averageScore === null ? '—' : marksText(stats.averageScore)}
          hint="Official attempts"
        />
        <Stat
          label="Passed"
          value={stats.withPassMark ? `${stats.passed} of ${stats.withPassMark}` : '—'}
          hint={a.passMarks === null ? 'No pass marks set' : `Pass marks ${marksText(a.passMarks)}`}
        />
        <Stat
          label="Awaiting marks"
          value={String(stats.pendingGrading)}
          hint={stats.inProgress ? `${stats.inProgress} in progress` : undefined}
        />
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Release"
          description={
            a.resultRelease === 'manual'
              ? a.released
                ? `Released ${formatDateTimeBs(a.resultsReleasedAt)}. Students see their scores and answers.`
                : 'Students see scores and answers only after you release them.'
              : a.resultRelease === 'immediate'
                ? 'Results are shown to each student right after submitting.'
                : 'Results are shown when the availability window closes.'
          }
          actions={
            a.resultRelease === 'manual' && !a.released && can('assessments:publish') ? (
              <Button onClick={() => setReleasing(true)}>Release results</Button>
            ) : a.released ? (
              <Badge tone="success">Released</Badge>
            ) : null
          }
        />
      </Card>

      <Card>
        <CardHeader
          title="Attempts"
          description="The official attempt of each student counts for statistics and rank."
        />
        {rows.length === 0 ? (
          <EmptyState title="No attempts yet" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH>Attempt</TH>
                <TH>Status</TH>
                <TH>Score</TH>
                <TH>Submitted</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <Link
                      to="/attempts/$attemptId"
                      params={{ attemptId: t.id }}
                      className="font-medium text-link"
                    >
                      {t.student.fullName}
                    </Link>
                  </TD>
                  <TD>
                    {t.attemptNo}
                    {t.official ? (
                      <Badge tone="primary" className="ml-2">
                        Official
                      </Badge>
                    ) : null}
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        t.status === 'pending_grading'
                          ? 'warning'
                          : t.status === 'completed'
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {ATTEMPT_STATUS_LABEL[t.status]}
                    </Badge>
                    {t.practice ? (
                      <Badge tone="neutral" className="ml-2">
                        Practice
                      </Badge>
                    ) : null}
                    {t.autoSubmitted ? (
                      <span className="ml-2 text-xs text-text-muted">time ran out</span>
                    ) : null}
                  </TD>
                  <TD>
                    {t.status === 'in_progress' ? '—' : `${marksText(t.score)} / ${marksText(t.maxScore)}`}
                    {t.passed !== null ? (
                      <span className={t.passed ? 'ml-2 text-xs text-success' : 'ml-2 text-xs text-danger'}>
                        {t.passed ? 'passed' : 'not passed'}
                      </span>
                    ) : null}
                  </TD>
                  <TD>{formatDateTimeBs(t.submittedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {results.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={results.isFetchingNextPage}
            onClick={() => void results.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      ) : null}

      <LeaderboardCard assessmentId={assessmentId} />

      <ConfirmDialog
        open={releasing}
        onOpenChange={setReleasing}
        title="Release results?"
        tone="primary"
        confirmLabel="Release results"
        description={
          stats.pendingGrading
            ? `Students will see their scores and answers. ${plural(stats.pendingGrading, 'attempt')} still await marks; they show "awaiting marks" until graded.`
            : 'Students will see their scores and answers. This cannot be undone.'
        }
        onConfirm={release}
      />
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text">{value}</p>
      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
    </Card>
  );
}

interface StaffLeaderboard {
  released: boolean;
  total: number;
  top: Array<{
    rank: number;
    userId: string;
    name: string;
    email: string | null;
    attemptId: string;
    score: number;
    timeTakenSeconds: number;
  }>;
}

/** The ranking with full names (audit F-03); students see it per the CMS name setting, after release. */
function LeaderboardCard({ assessmentId }: { assessmentId: string }) {
  const board = useQuery({
    queryKey: ['assessment-leaderboard', assessmentId],
    queryFn: () => api.get<StaffLeaderboard | null>(`/admin/assessments/${assessmentId}/leaderboard`),
  });
  if (board.isPending) return null;
  if (board.isError) {
    return (
      <Card className="mt-6">
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      </Card>
    );
  }
  if (!board.data) return null;
  const b = board.data;
  return (
    <Card className="mt-6">
      <CardHeader
        title="Leaderboard"
        description={`${plural(b.total, 'student')} ranked by score, then time.${
          b.released ? '' : ' Students do not see it until results are released.'
        }`}
      />
      {b.top.length === 0 ? (
        <EmptyState title="No finished attempts yet" description="Ranks appear once attempts are marked." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Rank</TH>
              <TH>Student</TH>
              <TH>Score</TH>
              <TH>Time</TH>
            </TR>
          </THead>
          <TBody>
            {b.top.map((e) => (
              <TR key={e.userId}>
                <TD className="tabular-nums">{e.rank}</TD>
                <TD>
                  <Link
                    to="/attempts/$attemptId"
                    params={{ attemptId: e.attemptId }}
                    className="font-medium text-link"
                  >
                    {e.name}
                  </Link>
                  {e.email ? <p className="text-xs text-text-muted">{e.email}</p> : null}
                </TD>
                <TD className="tabular-nums">{marksText(e.score)}</TD>
                <TD className="tabular-nums">{formatDuration(e.timeTakenSeconds)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
