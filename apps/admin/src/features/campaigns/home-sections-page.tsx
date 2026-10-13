import { HOME_SECTION_KEYS, type HomeSectionKey, type HomeSections } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardHeader, ErrorState, PageHeader, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';

/** What each Home section is, in the words staff see in the app. */
const SECTION: Record<HomeSectionKey, { label: string; hint: string }> = {
  live: { label: 'Live classes', hint: 'Live now and the next live class of the student’s courses.' },
  currentCourse: { label: 'Continue learning', hint: 'The course the student was last studying.' },
  todayPlan: { label: 'Today’s study plan', hint: 'From the student’s planner, when they have one.' },
  articles: { label: 'Current affairs and news', hint: 'Tiles to the latest articles.' },
  dailyChallenge: { label: 'Daily challenge', hint: 'Today’s challenge, when there is one.' },
  upcomingExams: { label: 'Upcoming exams', hint: 'Weekly, mock and previous-year exams coming up.' },
  latestNotices: { label: 'Latest notices', hint: 'The two newest notices.' },
  progress: { label: 'My progress', hint: 'Link to the student’s progress.' },
  tests: { label: 'Tests', hint: 'Link to all tests.' },
  pyq: { label: 'Previous-year questions', hint: 'Link to the previous-year questions, when there are any.' },
  courses: { label: 'Courses for you', hint: 'Courses for the exam the student is preparing for.' },
};

/** Fills in sections a newer version added, so every section can be placed. */
function complete(value: HomeSections): HomeSections['sections'] {
  const listed = new Set(value.sections.map((s) => s.key));
  return [
    ...value.sections,
    ...HOME_SECTION_KEYS.filter((k) => !listed.has(k)).map((key) => ({ key, visible: true })),
  ];
}

/**
 * The app's Home screen (D-075 / audit F-08): the order of its sections and which are shown. The search bar, banners
 * and "preparing for" card always stay at the top. Sections with nothing to show (no live class, no notices…) hide
 * themselves in the app either way.
 */
export function HomeSectionsPage() {
  const saved = useQuery({
    queryKey: ['home-sections'],
    queryFn: () => api.get<HomeSections>('/admin/home-sections'),
  });
  return (
    <>
      <PageHeader
        title="Home screen"
        description="Arrange the sections of the app's Home screen and hide the ones you do not want. Apps pick up the change within a few minutes."
      />
      {saved.isPending ? (
        <Spinner />
      ) : saved.isError ? (
        <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />
      ) : (
        <SectionsEditor key={JSON.stringify(saved.data)} initial={complete(saved.data)} />
      )}
    </>
  );
}

function SectionsEditor({ initial }: { initial: HomeSections['sections'] }) {
  const qc = useQueryClient();
  const [sections, setSections] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(sections) !== JSON.stringify(initial);
  const move = (index: number, by: -1 | 1) =>
    setSections((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item!);
      return next;
    });
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put('/admin/home-sections', { sections });
      await qc.invalidateQueries({ queryKey: ['home-sections'] });
      toast.success('Home screen saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="Sections, top to bottom"
        description="Search, banners and the “preparing for” card come first, then these."
      />
      {error ? (
        <div className="px-5 pt-4">
          <Alert tone="danger" title={error} />
        </div>
      ) : null}
      <ol className="divide-y divide-border" aria-label="Home sections">
        {sections.map((s, i) => {
          const info = SECTION[s.key];
          return (
            <li key={s.key} className="flex items-center gap-3 px-5 py-3">
              <span className="w-6 text-sm tabular-nums text-text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p
                  className={s.visible ? 'font-medium text-text' : 'font-medium text-text-muted line-through'}
                >
                  {info.label}
                </p>
                <p className="text-xs text-text-muted">{info.hint}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move ${info.label} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move ${info.label} down`}
                disabled={i === sections.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </Button>
              <Switch
                checked={s.visible}
                label={`Show ${info.label}`}
                onCheckedChange={(visible) =>
                  setSections((list) => list.map((x) => (x.key === s.key ? { ...x, visible } : x)))
                }
              />
            </li>
          );
        })}
      </ol>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => setSections(initial)}
        >
          Discard
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={saving}
          onClick={() => setSections(HOME_SECTION_KEYS.map((key) => ({ key, visible: true })))}
        >
          Default order
        </Button>
        <Button size="sm" disabled={!dirty} loading={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </Card>
  );
}
