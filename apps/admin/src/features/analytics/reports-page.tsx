import type { LocalizedText, Permission } from '@tk/contracts';
import { formatNpr } from '@tk/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form';
import { Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateBs, localized } from '@/lib/format';
import { cn } from '@/lib/utils';

type Tab = 'sales' | 'students' | 'learning' | 'tests';
const TABS: Array<{
  value: Tab;
  label: string;
  permission: Permission;
  export: string;
  exportLabel: string;
}> = [
  { value: 'sales', label: 'Sales', permission: 'orders:read', export: 'orders', exportLabel: 'Orders' },
  {
    value: 'students',
    label: 'Students',
    permission: 'users:read',
    export: 'students',
    exportLabel: 'Students',
  },
  {
    value: 'learning',
    label: 'Learning',
    permission: 'courses:edit',
    export: 'enrolments',
    exportLabel: 'Enrolments',
  },
  {
    value: 'tests',
    label: 'Tests & questions',
    permission: 'assessments:edit',
    export: 'test-results',
    exportLabel: 'Test results',
  },
];
const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 365 days' },
];
const LABEL: Record<string, string> = {
  android: 'Android',
  ios: 'iPhone / iPad',
  web: 'Website',
  khalti: 'Khalti',
  esewa: 'eSewa',
  connectips: 'ConnectIPS',
  order: 'Bought',
  admin_grant: 'Given by staff',
  coupon: 'Coupon',
  referral: 'Referral reward',
  free_enrol: 'Joined free',
};

/** Nepal-day period as `from` / `to`, the last `days` days ending today. */
function periodOf(days: number) {
  const npt = new Date(Date.now() + 345 * 60_000);
  const to = npt.toISOString().slice(0, 10);
  const from = new Date(npt.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}
const dayLabel = (day: string) => formatDateBs(`${day}T06:15:00Z`);
const rs = (paisa: number) => formatNpr(paisa, 'en');
const hours = (seconds: number) => `${(seconds / 3600).toFixed(1)} h`;

/** Reports (Phase 13e, D-066): dashboards over a period, and CSV downloads of the underlying records. */
export function ReportsPage() {
  const { can } = useAuth();
  const tabs = TABS.filter((t) => can(t.permission));
  const [tab, setTab] = useState<Tab | null>(tabs[0]?.value ?? null);
  const [days, setDays] = useState('30');
  const period = periodOf(Number(days));
  const current = tabs.find((t) => t.value === tab) ?? tabs[0];
  const [downloading, setDownloading] = useState(false);

  if (!current) {
    return (
      <>
        <PageHeader title="Reports" />
        <EmptyState title="You do not have access to any report" />
      </>
    );
  }
  const download = async () => {
    setDownloading(true);
    try {
      await api.download(
        `/admin/exports/${current.export}.csv?from=${period.from}&to=${period.to}`,
        `${current.export}.csv`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Reports"
        description="Figures for the chosen period (Nepal days), straight from the records. Download the records behind each report as CSV (opens in Excel; dates in BS and AD)."
      />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-48">
          <Field label="Period">
            {(a) => (
              <Select {...a} value={days} onChange={(e) => setDays(e.target.value)}>
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <p className="pb-2 text-sm text-text-muted">
          {dayLabel(period.from)} – {dayLabel(period.to)}
        </p>
        <div className="ml-auto pb-0.5">
          <Button variant="secondary" loading={downloading} onClick={() => void download()}>
            <Download className="size-4" aria-hidden />
            {current.exportLabel} (CSV)
          </Button>
        </div>
      </div>
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist" aria-label="Reports">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={current.value === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-semibold',
              current.value === t.value
                ? 'border-primary text-text'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Report tab={current.value} from={period.from} to={period.to} />
    </>
  );
}

function Report({ tab, from, to }: { tab: Tab; from: string; to: string }) {
  const q = useQuery({
    queryKey: ['analytics', tab, from, to],
    queryFn: () => api.get<Record<string, never>>(`/admin/analytics/${tab}`, { from, to }),
  });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data as never;
  if (tab === 'sales') return <SalesReport data={d} />;
  if (tab === 'students') return <StudentsReport data={d} />;
  if (tab === 'learning') return <LearningReport data={d} />;
  return <TestsReport data={d} />;
}

// ───────────── Reports ─────────────

type Keyed = { key: string; orders?: number; revenuePaisa?: number; count?: number };

function SalesReport({
  data,
}: {
  data: {
    totals: Record<
      | 'orders'
      | 'revenuePaisa'
      | 'refundsPaisa'
      | 'refunds'
      | 'netPaisa'
      | 'averageOrderPaisa'
      | 'discountPaisa'
      | 'couponOrders',
      number
    >;
    daily: Array<{ day: string; orders: number; revenuePaisa: number }>;
    channels: Keyed[];
    providers: Keyed[];
    items: Array<{ type: string; id: string; title: LocalizedText; orders: number; revenuePaisa: number }>;
  };
}) {
  const t = data.totals;
  return (
    <div className="flex flex-col gap-4">
      <Tiles>
        <Tile label="Revenue" value={rs(t.revenuePaisa)} hint={`${t.orders} paid orders`} />
        <Tile label="Refunds sent" value={rs(t.refundsPaisa)} hint={`${t.refunds} refunds`} />
        <Tile label="Net" value={rs(t.netPaisa)} hint="Revenue less refunds" />
        <Tile
          label="Average order"
          value={rs(t.averageOrderPaisa)}
          hint={`${t.couponOrders} with a coupon`}
        />
      </Tiles>
      <DailyBars title="Revenue per day" daily={data.daily} value={(d) => d.revenuePaisa} format={rs} />
      <DailyBars title="Paid orders per day" daily={data.daily} value={(d) => d.orders} format={String} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown
          title="By channel"
          rows={data.channels.map((c) => [
            LABEL[c.key] ?? c.key,
            c.revenuePaisa ?? 0,
            `${rs(c.revenuePaisa ?? 0)} · ${c.orders}`,
          ])}
        />
        <Breakdown
          title="By payment provider"
          rows={data.providers.map((c) => [
            LABEL[c.key] ?? c.key,
            c.revenuePaisa ?? 0,
            `${rs(c.revenuePaisa ?? 0)} · ${c.orders}`,
          ])}
        />
        <Breakdown
          title="Top courses and plans"
          rows={data.items.map((i) => [
            localized(i.title),
            i.revenuePaisa,
            `${rs(i.revenuePaisa)} · ${i.orders}`,
          ])}
        />
      </div>
    </div>
  );
}

function StudentsReport({
  data,
}: {
  data: {
    totals: { students: number; signups: number; active: number };
    daily: Array<{ day: string; signups: number; active: number }>;
    signupPlatforms: Keyed[];
    activePlatforms: Keyed[];
  };
}) {
  return (
    <div className="flex flex-col gap-4">
      <Tiles>
        <Tile label="Students" value={data.totals.students.toLocaleString('en-IN')} hint="All accounts" />
        <Tile label="New sign-ups" value={data.totals.signups.toLocaleString('en-IN')} hint="In the period" />
        <Tile
          label="Active"
          value={data.totals.active.toLocaleString('en-IN')}
          hint="Used the app or website"
        />
      </Tiles>
      <DailyBars title="Sign-ups per day" daily={data.daily} value={(d) => d.signups} format={String} />
      <DailyBars title="Active students per day" daily={data.daily} value={(d) => d.active} format={String} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="Signed up on"
          rows={data.signupPlatforms.map((c) => [LABEL[c.key] ?? c.key, c.count ?? 0, String(c.count)])}
        />
        <Breakdown
          title="Active on"
          rows={data.activePlatforms.map((c) => [LABEL[c.key] ?? c.key, c.count ?? 0, String(c.count)])}
        />
      </div>
    </div>
  );
}

function LearningReport({
  data,
}: {
  data: {
    totals: { enrolments: number; lessonsFinished: number; studySeconds: number; learners: number };
    daily: Array<{ day: string; enrolments: number; lessonsFinished: number; studySeconds: number }>;
    sources: Keyed[];
    courses: Array<{ id: string; title: LocalizedText; enrolments: number }>;
    lessons: Array<{ id: string; title: LocalizedText; type: string; finished: number }>;
  };
}) {
  const t = data.totals;
  return (
    <div className="flex flex-col gap-4">
      <Tiles>
        <Tile label="New access" value={String(t.enrolments)} hint="Courses and plans given" />
        <Tile label="Lessons finished" value={String(t.lessonsFinished)} />
        <Tile label="Study time" value={hours(t.studySeconds)} hint={`${t.learners} students measured`} />
      </Tiles>
      <DailyBars
        title="Lessons finished per day"
        daily={data.daily}
        value={(d) => d.lessonsFinished}
        format={String}
      />
      <DailyBars title="Study time per day" daily={data.daily} value={(d) => d.studySeconds} format={hours} />
      <DailyBars title="New access per day" daily={data.daily} value={(d) => d.enrolments} format={String} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown
          title="How students got access"
          rows={data.sources.map((c) => [LABEL[c.key] ?? c.key, c.count ?? 0, String(c.count)])}
        />
        <Breakdown
          title="Courses joined most"
          rows={data.courses.map((c) => [localized(c.title), c.enrolments, String(c.enrolments)])}
        />
        <Breakdown
          title="Lessons finished most"
          rows={data.lessons.map((l) => [localized(l.title), l.finished, String(l.finished)])}
        />
      </div>
    </div>
  );
}

function TestsReport({
  data,
}: {
  data: {
    totals: { attempts: number; openReports: number };
    daily: Array<{ day: string; attempts: number }>;
    assessments: Array<{
      id: string;
      title: LocalizedText;
      attempts: number;
      students: number;
      average: number | null;
      passed: number;
      graded: number;
    }>;
    hardest: Array<{
      id: string;
      answered: number;
      accuracy: number;
      preview?: string;
      subject?: LocalizedText;
    }>;
    minAnswersForDifficulty: number;
    reported: Array<{ id: string; reports: number; preview?: string; subject?: LocalizedText }>;
  };
}) {
  return (
    <div className="flex flex-col gap-4">
      <Tiles>
        <Tile label="Tests submitted" value={String(data.totals.attempts)} />
        <Tile label="Open question reports" value={String(data.totals.openReports)} />
      </Tiles>
      <DailyBars
        title="Tests submitted per day"
        daily={data.daily}
        value={(d) => d.attempts}
        format={String}
      />
      <Card className="overflow-x-auto p-5">
        <h2 className="mb-3 font-semibold">Most taken tests</h2>
        {data.assessments.length === 0 ? (
          <p className="text-sm text-text-muted">No tests submitted in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-text-muted">
              <tr>
                <th className="py-1 font-medium">Test</th>
                <th className="py-1 text-right font-medium">Attempts</th>
                <th className="py-1 text-right font-medium">Students</th>
                <th className="py-1 text-right font-medium">Average</th>
                <th className="py-1 text-right font-medium">Passed</th>
              </tr>
            </thead>
            <tbody>
              {data.assessments.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-1.5">{localized(a.title)}</td>
                  <td className="py-1.5 text-right">{a.attempts}</td>
                  <td className="py-1.5 text-right">{a.students}</td>
                  <td className="py-1.5 text-right">{a.average === null ? '—' : `${a.average}%`}</td>
                  <td className="py-1.5 text-right">
                    {a.graded ? `${Math.round((a.passed * 100) / a.graded)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <QuestionList
          title="Hardest questions"
          hint={`Lowest share answered correctly, with at least ${data.minAnswersForDifficulty} answers in the period.`}
          rows={data.hardest.map((q) => ({
            id: q.id,
            preview: q.preview,
            subject: q.subject,
            figure: `${q.accuracy}% of ${q.answered}`,
          }))}
        />
        <QuestionList
          title="Most reported questions"
          hint="Open reports from students."
          rows={data.reported.map((q) => ({
            id: q.id,
            preview: q.preview,
            subject: q.subject,
            figure: `${q.reports} open`,
          }))}
        />
      </div>
    </div>
  );
}

// ───────────── Pieces ─────────────

function Tiles({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-text">{value}</p>
      {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
    </Card>
  );
}

/**
 * One measure per day as thin bars on a shared baseline (single series: the title names it, no legend). Each bar has
 * a hover / focus tooltip with the day and value; the same numbers are in a table for screen readers and copying.
 */
function DailyBars<T extends { day: string }>({
  title,
  daily,
  value,
  format,
}: {
  title: string;
  daily: T[];
  value: (d: T) => number;
  format: (n: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...daily.map(value));
  const total = daily.reduce((sum, d) => sum + value(d), 0);
  const shown = active !== null ? daily[active] : null;
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm tabular-nums text-text-secondary" aria-live="polite">
          {shown ? `${dayLabel(shown.day)}: ${format(value(shown))}` : `Total ${format(total)}`}
        </p>
      </div>
      <div className="flex">
        <div
          className="flex w-16 shrink-0 flex-col justify-between pr-2 text-right text-xs tabular-nums text-text-muted"
          aria-hidden
        >
          <span>{format(max)}</span>
          <span>0</span>
        </div>
        <div
          className="flex h-40 flex-1 items-end gap-[2px] border-b border-border"
          role="list"
          aria-label={title}
          onMouseLeave={() => setActive(null)}
        >
          {daily.map((d, i) => {
            const v = value(d);
            return (
              <div
                key={d.day}
                role="listitem"
                tabIndex={0}
                aria-label={`${dayLabel(d.day)}: ${format(v)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="group flex h-full min-w-0 flex-1 items-end outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <div
                  className={cn(
                    'w-full rounded-t-[4px] bg-primary transition-opacity',
                    active !== null && active !== i ? 'opacity-40' : 'opacity-100',
                  )}
                  style={{ height: max > 0 && v > 0 ? `${Math.max(2, (v / max) * 100)}%` : '0%' }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="ml-16 mt-1 flex justify-between text-xs text-text-muted" aria-hidden>
        <span>{daily[0] ? dayLabel(daily[0].day) : ''}</span>
        <span>{daily.at(-1) ? dayLabel(daily.at(-1)!.day) : ''}</span>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-text-secondary">Show as a table</summary>
        <table className="mt-2 w-full">
          <tbody>
            {daily.map((d) => (
              <tr key={d.day} className="border-t border-border">
                <td className="py-1">{dayLabel(d.day)}</td>
                <td className="py-1 text-right tabular-nums">{format(value(d))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}

/** A ranked list with a bar showing each row's share of the largest. */
function Breakdown({ title, rows }: { title: string; rows: Array<[string, number, string]> }) {
  const max = Math.max(0, ...rows.map((r) => r[1]));
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing in this period.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(([label, n, text]) => (
            <li key={label} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{label}</span>
                <span className="shrink-0 tabular-nums text-text-secondary">{text}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${max ? (n / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function QuestionList({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: Array<{ id: string; preview?: string; subject?: LocalizedText; figure: string }>;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-text-muted">{hint}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">None in this period.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((q) => (
            <li key={q.id} className="flex justify-between gap-3 py-2 text-sm">
              <Link
                to="/questions/$questionId"
                params={{ questionId: q.id }}
                className="line-clamp-2 hover:text-link"
              >
                {q.preview || 'Question'}
                {q.subject ? <span className="text-text-muted"> · {localized(q.subject)}</span> : null}
              </Link>
              <span className="shrink-0 tabular-nums text-text-secondary">{q.figure}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
