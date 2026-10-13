import type { Permission } from '@tk/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { BookOpen, CornerDownLeft, Plus, Search, User, type LucideIcon } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import { useEffect, useId, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { localized } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface PaletteNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  anyPermission?: Permission[];
}

interface Entry {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  to: string;
}

/** "New …" shortcuts, each shown to staff who may create it. */
const CREATE: Array<{ label: string; to: string; permission: Permission }> = [
  { label: 'New notice', to: '/notices/new', permission: 'notices:edit' },
  { label: 'New article', to: '/articles/new', permission: 'articles:edit' },
  { label: 'New campaign', to: '/campaigns/new', permission: 'campaigns:send' },
];

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * The CMS command palette (DESIGN_SYSTEM §9, KI-024): Ctrl K / ⌘K opens it anywhere. Go to any page the staff
 * member may open, start something new, or find a course or a student by name — all with the keyboard.
 */
export function CommandPalette({ groups }: { groups: Array<{ group: string; items: PaletteNavItem[] }> }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const search = useDebounced(query.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const courses = useQuery({
    queryKey: ['palette-courses', search],
    queryFn: ({ signal }) =>
      api.get<{ data: Array<{ id: string; title: Record<string, string> }> }>(
        '/admin/courses',
        { q: search, limit: 5 },
        signal,
      ),
    enabled: open && search.length >= 2 && can('courses:edit'),
  });
  const students = useQuery({
    queryKey: ['palette-students', search],
    queryFn: ({ signal }) =>
      api.get<{ data: Array<{ id: string; fullName: string; email: string | null }> }>(
        '/admin/users',
        { q: search, limit: 5 },
        signal,
      ),
    enabled: open && search.length >= 2 && can('users:read'),
  });

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (text: string) => !q || text.toLowerCase().includes(q);
    const pages: Entry[] = groups.flatMap(({ group, items }) =>
      items
        .filter(
          (i) =>
            (!i.permission || can(i.permission)) && (!i.anyPermission || i.anyPermission.some((p) => can(p))),
        )
        .filter((i) => matches(`${i.label} ${group}`))
        .map((i) => ({
          id: `page:${i.to}`,
          group: 'Go to',
          label: i.label,
          hint: group,
          icon: i.icon,
          to: i.to,
        })),
    );
    const create: Entry[] = CREATE.filter((c) => can(c.permission) && matches(c.label)).map((c) => ({
      id: `new:${c.to}`,
      group: 'Create',
      label: c.label,
      icon: Plus,
      to: c.to,
    }));
    const found: Entry[] = [
      ...(courses.data?.data ?? []).map((c) => ({
        id: `course:${c.id}`,
        group: 'Courses',
        label: localized(c.title),
        icon: BookOpen,
        to: `/courses/${c.id}`,
      })),
      ...(students.data?.data ?? []).map((s) => ({
        id: `student:${s.id}`,
        group: 'Students',
        label: s.fullName,
        hint: s.email ?? undefined,
        icon: User,
        to: `/students/${s.id}`,
      })),
    ];
    return [...pages, ...create, ...found];
  }, [query, groups, can, courses.data, students.data]);

  const current = Math.min(active, Math.max(entries.length - 1, 0));
  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    setQuery('');
    void navigate({ to: entry.to });
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((current + 1) % Math.max(entries.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((current - 1 + entries.length) % Math.max(entries.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(entries[current]);
    }
  };

  let lastGroup = '';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-sm border border-border bg-surface px-3 text-sm text-text-muted hover:border-border-strong sm:flex"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="rounded-xs border border-border px-1.5 text-[11px] font-medium">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>
      <RadixDialog.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery('');
        }}
      >
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[rgba(11,18,32,0.45)] backdrop-blur-[2px]" />
          <RadixDialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-e3 focus:outline-none"
          >
            <RadixDialog.Title className="sr-only">Search or jump to</RadixDialog.Title>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-text-muted" aria-hidden />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={entries[current] ? `${listId}-${current}` : undefined}
                aria-label="Search or jump to"
                placeholder="Pages, new notice, a course or a student…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                className="h-12 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
              />
            </div>
            <ul id={listId} role="listbox" aria-label="Results" className="overflow-y-auto p-2">
              {entries.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-text-muted">Nothing found.</li>
              ) : (
                entries.map((entry, i) => {
                  const heading = entry.group !== lastGroup ? entry.group : null;
                  lastGroup = entry.group;
                  const Icon = entry.icon;
                  return (
                    <li key={entry.id} role="presentation">
                      {heading ? (
                        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                          {heading}
                        </p>
                      ) : null}
                      <div
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === current}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(entry)}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm',
                          i === current ? 'bg-primary-soft text-on-primary-soft' : 'text-text',
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                        {entry.hint ? (
                          <span className="truncate text-xs text-text-muted">{entry.hint}</span>
                        ) : null}
                        {i === current ? <CornerDownLeft className="size-3.5" aria-hidden /> : null}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </>
  );
}
